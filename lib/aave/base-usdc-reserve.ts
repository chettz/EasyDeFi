/**
 * Aave Base USDC 풀의 현재 상태와, 고른 기간의 공급 연 수익률 이력을 읽는다.
 * 예치 트랜잭션은 보내지 않는다.
 */

import { getTokenContract } from "../deposit/token-contracts";

// Aave v3 Base Pool
const AAVE_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
// Aave v3 상태 조회 url
const AAVE_GRAPHQL = "https://api.v3.aave.com/graphql";

const WINDOWS = {
  "1주": "LAST_WEEK",
  "1달": "LAST_MONTH",
  "6개월": "LAST_SIX_MONTHS",
  "1년": "LAST_YEAR",
} as const;

export type AaveApyWindow = keyof typeof WINDOWS;

const QUERY = `
  query ReserveDetail($reserve: ReserveRequest!, $history: SupplyAPYHistoryRequest!) {
    reserve(request: $reserve) {
      aToken { symbol }
      size { usd }
      supplyInfo { total { value } }
      borrowInfo {
        availableLiquidity { amount { value } }
        utilizationRate { formatted }
      }
    }
    supplyAPYHistory(request: $history) {
      date
      avgRate { formatted }
    }
  }
`;

export async function getBaseUsdcReserveDetail(window: AaveApyWindow) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  const reserve = {
    chainId: 8453,
    market: AAVE_BASE_POOL,
    underlyingToken: usdc.address,
  };
  const response = await fetch(AAVE_GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      query: QUERY,
      variables: {
        reserve,
        history: { ...reserve, window: WINDOWS[window] },
      },
    }),
  });
  if (!response.ok) throw new Error("Aave reserve request failed.");

  const body = await response.json();
  const reserveData = body?.data?.reserve;
  const history = body?.data?.supplyAPYHistory;
  const suppliedAmount = reserveData?.supplyInfo?.total?.value;
  const reserveSizeUsd = reserveData?.size?.usd;
  const availableLiquidity = reserveData?.borrowInfo?.availableLiquidity?.amount?.value;
  const utilizationRate = reserveData?.borrowInfo?.utilizationRate?.formatted;
  const aTokenSymbol = reserveData?.aToken?.symbol;
  if (
    typeof suppliedAmount !== "string" ||
    typeof reserveSizeUsd !== "string" ||
    typeof availableLiquidity !== "string" ||
    typeof utilizationRate !== "string" ||
    typeof aTokenSymbol !== "string" ||
    !Array.isArray(history)
  ) {
    throw new Error("Aave reserve detail was not returned.");
  }

  // 조회 결과는 최신 시점이 앞이다. 그래프는 왼쪽이 과거가 되게 뒤집는다.
  // avgRate.formatted는 퍼센트 숫자다. 예: "4.85"
  const apyHistory = history
    .map((point: { date?: string; avgRate?: { formatted?: string } }) => ({
      date: point?.date,
      apy: point?.avgRate?.formatted,
    }))
    .filter((point): point is { date: string; apy: string } => {
      return typeof point.date === "string" && typeof point.apy === "string" && point.apy.length > 0;
    })
    .reverse();

  return {
    suppliedAmount,
    reserveSizeUsd,
    availableLiquidity,
    utilizationRate: `${utilizationRate}%`,
    aTokenSymbol,
    apyHistory,
  };
}
