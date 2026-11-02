/**
 * 예치 상품의 가치 변화. 가치는 넣어 둔 금액과 이자를 더한 USDC(달러)다.
 * Morpho는 포지션 이력을 그대로 쓰고, Aave는 공급·인출에 공급 수익률을 얹어 현재 잔액에 맞춘다.
 */

import { formatUnits } from "viem";
import { getBaseUsdcWithdrawable } from "../aave/supply-base-usdc";
import { getTokenContract } from "../deposit/token-contracts";

const AAVE_GRAPHQL = "https://api.v3.aave.com/graphql";
const AAVE_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const MORPHO_GRAPHQL = "https://api.morpho.org/graphql";
const STEAKHOUSE_PRIME_USDC = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
const YEAR = 365 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

export const PORTFOLIO_PRODUCTS = {
  aave: "Aave Base USDC",
  morpho: "Steakhouse Prime USDC",
} as const;

export const HISTORY_PERIODS = ["1D", "1W", "1M", "1Y", "ALL"] as const;

export type PortfolioProduct = keyof typeof PORTFOLIO_PRODUCTS;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];
export type PositionHistory = {
  points: { time: number; value: number }[];
  deposited: number;
  interest: number;
  start: number;
  end: number;
};

type Sample = { time: number; rate: number };
type Transfer = { time: number; amount: number; supply: boolean };

const AAVE_WINDOW = {
  "1D": "LAST_DAY",
  "1W": "LAST_WEEK",
  "1M": "LAST_MONTH",
  "1Y": "LAST_YEAR",
  ALL: "LAST_YEAR",
} as const;

export async function getPositionHistory(product: PortfolioProduct, owner: string, period: HistoryPeriod) {
  return product === "aave" ? aaveHistory(owner, period) : morphoHistory(owner, period);
}

async function post<T>(url: string, query: string, variables: object): Promise<T | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error("Position history request failed.");
  const body = (await response.json()) as { data?: T | null; errors?: { message?: string }[] };
  if (body.errors?.length && !body.data) {
    if (body.errors.some((error) => error.message?.includes("No results"))) return null;
    throw new Error(body.errors[0]?.message ?? "Position history request failed.");
  }
  return body.data ?? null;
}

function seconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return parsed > 1e12 ? Math.floor(parsed / 1000) : Math.floor(parsed);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function decimal(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rangeStart(period: HistoryPeriod, now: number, firstTransfer?: number) {
  if (period === "1D") return now - DAY;
  if (period === "1W") return now - 7 * DAY;
  if (period === "1M") return now - 30 * DAY;
  if (period === "1Y") return now - 365 * DAY;
  return firstTransfer ?? now - 3 * 365 * DAY;
}

function stepFor(period: HistoryPeriod) {
  if (period === "1D" || period === "1W") return 60 * 60;
  if (period === "1M") return 6 * 60 * 60;
  if (period === "1Y") return DAY;
  return 7 * DAY;
}

function timeline(times: number[]) {
  return [...new Set(times.filter((time) => Number.isFinite(time)))].sort((a, b) => a - b);
}

function rateAt(samples: Sample[], time: number) {
  let rate = samples[0]?.rate ?? 0;
  for (const sample of samples) {
    if (sample.time > time) break;
    rate = sample.rate;
  }
  return rate;
}

function grow(value: number, from: number, to: number, samples: Sample[]) {
  if (value <= 0 || to <= from) return value;
  const stops = samples.map((sample) => sample.time).filter((time) => time > from && time < to);
  stops.push(to);
  let cursor = value;
  let time = from;
  for (const stop of stops) {
    cursor *= Math.pow(1 + Math.max(rateAt(samples, time), -0.99), (stop - time) / YEAR);
    time = stop;
  }
  return cursor;
}

function chartFromBalance(current: number, start: number, end: number, transfers: Transfer[], samples: Sample[], step: number) {
  const times = timeline([
    start,
    end,
    ...samples.map((sample) => sample.time),
    ...transfers.map((transfer) => transfer.time),
  ]);
  for (let time = end - step; time > start; time -= step) times.push(Math.floor(time));
  const marks = timeline(times).filter((time) => time >= start && time <= end);
  if (marks.length === 0) return [];

  const at = new Map<number, Transfer[]>();
  for (const transfer of transfers) {
    if (transfer.time < start || transfer.time > end) continue;
    at.set(transfer.time, [...(at.get(transfer.time) ?? []), transfer]);
  }

  let value = current;
  const points: { time: number; value: number }[] = [];
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    const time = marks[index];
    points.push({ time, value });
    const prev = marks[index - 1];
    if (prev === undefined) break;
    for (const transfer of [...(at.get(time) ?? [])].reverse()) {
      value += transfer.supply ? -transfer.amount : transfer.amount;
    }
    value = Math.max(0, value);
    const factor = grow(1, prev, time, samples);
    value = factor > 0 ? Math.max(0, value / factor) : value;
  }
  return points.reverse();
}

function principalOf(transfers: Transfer[], samples: Sample[], now: number) {
  let principal = 0;
  let value = 0;
  let cursor = transfers[0]?.time ?? now;
  for (const transfer of transfers) {
    value = grow(value, cursor, transfer.time, samples);
    cursor = transfer.time;
    if (transfer.supply) {
      principal += transfer.amount;
      value += transfer.amount;
    } else {
      const fromPrincipal = Math.max(0, transfer.amount - Math.max(0, value - principal));
      principal = Math.max(0, principal - fromPrincipal);
      value = Math.max(0, value - transfer.amount);
    }
  }
  return principal;
}

async function aaveSamples(underlying: string, window: (typeof AAVE_WINDOW)[HistoryPeriod]) {
  const data = await post<{ supplyAPYHistory?: { date?: string; avgRate?: { value?: string } }[] }>(
    AAVE_GRAPHQL,
    `query($history: SupplyAPYHistoryRequest!) {
      supplyAPYHistory(request: $history) { date avgRate { value } }
    }`,
    { history: { chainId: 8453, market: AAVE_BASE_POOL, underlyingToken: underlying, window } },
  );
  return (data?.supplyAPYHistory ?? [])
    .map((point) => {
      const time = seconds(point.date);
      const rate = decimal(point.avgRate?.value);
      return time === undefined || rate === undefined ? null : { time, rate };
    })
    .filter((point): point is Sample => point !== null)
    .sort((a, b) => a.time - b.time);
}

async function aaveTransfers(owner: string, underlying: string) {
  const transfers: Transfer[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const data = await post<{
      userTransactionHistory?: {
        items?: {
          __typename?: string;
          timestamp?: string;
          amount?: { amount?: { value?: string } };
          reserve?: { underlyingToken?: { address?: string } };
        }[];
        pageInfo?: { next?: string | null };
      };
    }>(
      AAVE_GRAPHQL,
      `query($request: UserTransactionHistoryRequest!) {
        userTransactionHistory(request: $request) {
          items {
            __typename
            ... on UserSupplyTransaction { timestamp amount { amount { value } } reserve { underlyingToken { address } } }
            ... on UserWithdrawTransaction { timestamp amount { amount { value } } reserve { underlyingToken { address } } }
          }
          pageInfo { next }
        }
      }`,
      {
        request: {
          market: AAVE_BASE_POOL,
          user: owner,
          chainId: 8453,
          filter: ["SUPPLY", "WITHDRAW"],
          orderBy: { date: "ASC" },
          pageSize: "FIFTY",
          ...(cursor ? { cursor } : {}),
        },
      },
    );
    const history = data?.userTransactionHistory;
    for (const item of history?.items ?? []) {
      if (item.reserve?.underlyingToken?.address?.toLowerCase() !== underlying.toLowerCase()) continue;
      const time = seconds(item.timestamp);
      const amount = decimal(item.amount?.amount?.value);
      if (time === undefined || amount === undefined || amount <= 0) continue;
      if (item.__typename === "UserSupplyTransaction") transfers.push({ time, amount, supply: true });
      if (item.__typename === "UserWithdrawTransaction") transfers.push({ time, amount, supply: false });
    }
    if (!history?.pageInfo?.next) break;
    cursor = history.pageInfo.next;
  }
  return transfers.sort((a, b) => a.time - b.time);
}

async function aaveHistory(owner: string, period: HistoryPeriod): Promise<PositionHistory> {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const [balance, transfers, samples, yearSamples] = await Promise.all([
    getBaseUsdcWithdrawable(owner),
    aaveTransfers(owner, usdc.address),
    aaveSamples(usdc.address, AAVE_WINDOW[period]),
    period === "1Y" || period === "ALL" ? Promise.resolve(null) : aaveSamples(usdc.address, "LAST_YEAR"),
  ]);
  if (balance === undefined) throw new Error("Aave balance was not returned.");

  const current = Number(formatUnits(balance, 6));
  const rates = yearSamples ?? samples;
  const start = rangeStart(period, now, transfers[0]?.time);
  const points = chartFromBalance(current, start, now, transfers, samples, stepFor(period));
  const deposited = transfers.length === 0 ? current : principalOf(transfers, rates, now);
  return { points, deposited, interest: current - deposited, start, end: now };
}

async function morphoHistory(owner: string, period: HistoryPeriod): Promise<PositionHistory> {
  const now = Math.floor(Date.now() / 1000);
  const start = rangeStart(period, now);
  const interval = period === "1D" || period === "1W" ? "HOUR" : period === "ALL" ? "WEEK" : "DAY";
  const data = await post<{
    vaultV2PositionByAddress?: {
      assets?: string | number;
      pnl?: string | number | null;
      history?: { assets?: { x?: number; y?: string | number | null }[] | null };
    } | null;
  }>(
    MORPHO_GRAPHQL,
    `query($user: String!, $options: TimeseriesOptions!) {
      vaultV2PositionByAddress(userAddress: $user, vaultAddress: "${STEAKHOUSE_PRIME_USDC}", chainId: 8453) {
        assets
        pnl
        history { assets(options: $options) { x y } }
      }
    }`,
    { user: owner, options: { startTimestamp: start, endTimestamp: now, interval } },
  );
  const position = data?.vaultV2PositionByAddress;
  const current = decimal(position?.assets);
  const pnl = decimal(position?.pnl) ?? 0;
  if (current === undefined) return { points: [], deposited: 0, interest: 0, start, end: now };

  const points = (position?.history?.assets ?? [])
    .map((point) => {
      const time = seconds(point.x);
      const value = decimal(point.y);
      return time === undefined || value === undefined ? null : { time, value: value / 1_000_000 };
    })
    .filter((point): point is { time: number; value: number } => point !== null)
    .sort((a, b) => a.time - b.time);
  if (period === "ALL") {
    const first = points.findIndex((point) => point.value > 0);
    if (first > 0) points.splice(0, first);
  }
  const value = current / 1_000_000;
  if (points.length === 0 || points[points.length - 1].time < now) points.push({ time: now, value });
  else points[points.length - 1] = { time: now, value };
  const domainStart = period === "ALL" ? (points[0]?.time ?? start) : start;
  return { points, deposited: (current - pnl) / 1_000_000, interest: pnl / 1_000_000, start: domainStart, end: now };
}
