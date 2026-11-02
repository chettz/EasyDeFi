"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getBaseUsdcSupplyApy } from "@/lib/aave/base-usdc-supply-apy";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { getMorphoVaultV2Apy } from "@/lib/morpho/vault-v2-apy";
import {
  getPositionHistory,
  HISTORY_PERIODS,
  PORTFOLIO_PRODUCTS,
  type HistoryPeriod,
  type PortfolioProduct,
  type PositionHistory,
} from "@/lib/portfolio/position-history";
import { ProductMark } from "@/features/assets/marks";

const STEAKHOUSE_PRIME_USDC = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
const BASE_CHAIN_ID = 8453;

function isProduct(value: string): value is PortfolioProduct {
  return value in PORTFOLIO_PRODUCTS;
}

function formatAxis(time: number, period: HistoryPeriod, span: number) {
  const date = new Date(time * 1000);
  if (period === "1D") return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (period === "1Y" || (period === "ALL" && span > 400 * 24 * 60 * 60)) {
    return date.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric" });
  }
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function formatAssetUsd(value: number) {
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return value < 0 ? `-$${text}` : `$${text}`;
}

function formatUsdc(value: number, sign: "keep" | "plus" = "keep", fractionDigits = 2) {
  const text = `${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: Math.min(2, fractionDigits), maximumFractionDigits: fractionDigits })} USDC`;
  if (value < 0) return `-${text}`;
  if (sign === "plus" && value > 0) return `+${text}`;
  return text;
}

function ValueChart({ history, period }: { history: PositionHistory; period: HistoryPeriod }) {
  const width = 342;
  const height = 104;
  const start = history.start;
  const end = history.end > start ? history.end : start + 1;
  const values = history.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(Math.abs(max) * 0.05, 1) : (max - min) * 0.08;
  const low = min - pad;
  const high = max + pad;
  const xOf = (time: number) => ((Math.min(end, Math.max(start, time)) - start) / (end - start)) * width;
  const yOf = (value: number) => (1 - (value - low) / (high - low)) * height;
  const line = history.points.map((point) => `${xOf(point.time)},${yOf(point.value)}`).join(" ");
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  const area = first && last ? `${line} ${xOf(last.time)},${height} ${xOf(first.time)},${height}` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => start + (end - start) * ratio);
  const [hover, setHover] = useState<number | null>(null);

  function track(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    history.points.forEach((point, index) => {
      const gap = Math.abs(xOf(point.time) - x);
      if (gap < distance) {
        nearest = index;
        distance = gap;
      }
    });
    setHover(nearest);
  }

  const point = hover === null ? null : history.points[hover];
  const pointX = point ? (xOf(point.time) / width) * 100 : 0;
  const pointY = point ? (yOf(point.value) / height) * 100 : 0;
  const tipX = Math.min(82, Math.max(18, pointX));

  return (
    <div className="assets-chart-plot">
      <div className="assets-chart-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="자산 변화" onPointerMove={track} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="assets-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3182f6" stopOpacity="0.28" />
              <stop offset="1" stopColor="#3182f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width={width} height={height} fill="transparent" />
          {history.points.length > 1 ? (
            <>
              <polygon points={area} fill="url(#assets-chart-fill)" />
              <polyline points={line} fill="none" stroke="#3182f6" strokeWidth="2" />
            </>
          ) : (
            <line x1="0" x2={width} y1={yOf(values[0] ?? 0)} y2={yOf(values[0] ?? 0)} stroke="#3182f6" strokeWidth="2" />
          )}
        </svg>
        {point ? (
          <>
            <span className="assets-chart-guide" style={{ left: `${pointX}%`, height: `${pointY}%` }} />
            <span className="assets-chart-dot" style={{ left: `${pointX}%`, top: `${pointY}%` }} />
            <div className="assets-chart-tip" style={{ left: `${tipX}%`, top: `${pointY}%` }}>
              <span>{formatAxis(point.time, period, end - start)}</span>
              <strong>{formatAssetUsd(point.value)}</strong>
            </div>
          </>
        ) : null}
      </div>
      <div className="assets-axis">
        {ticks.map((time) => (
          <span key={time}>{formatAxis(time, period, end - start)}</span>
        ))}
      </div>
    </div>
  );
}

export default function ProductPortfolioPage({ params }: { params: Promise<{ product: string }> }) {
  const { product: productParam } = use(params);
  const product = isProduct(productParam) ? productParam : null;
  const { authenticated } = usePrivy();
  const { accounts, isLoading } = useDepositAccounts();
  const [period, setPeriod] = useState<HistoryPeriod>("1W");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<{ period: HistoryPeriod; history: PositionHistory; failed: false } | { period: HistoryPeriod; failed: true } | null>(null);
  const [apy, setApy] = useState<string | null>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    const load = product === "aave" ? getBaseUsdcSupplyApy() : getMorphoVaultV2Apy(STEAKHOUSE_PRIME_USDC, BASE_CHAIN_ID);
    load
      .then((value) => {
        if (!cancelled) setApy(value);
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled) setApy("조회 실패");
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    if (!periodOpen) return;
    function close(event: MouseEvent) {
      if (!periodRef.current?.contains(event.target as Node)) setPeriodOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [periodOpen]);

  useEffect(() => {
    if (!product || !authenticated || isLoading) return;
    const owner = getDepositAddress("base", accounts);
    if (!owner) return;
    let cancelled = false;
    getPositionHistory(product, owner, period)
      .then((loaded) => {
        if (!cancelled) setSnapshot({ period, history: loaded, failed: false });
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled) setSnapshot({ period, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [accounts, authenticated, isLoading, period, product]);

  if (!product) {
    return (
      <main className="wallet-page assets-page">
        <p className="assets-empty">없는 상품이에요.</p>
      </main>
    );
  }

  const owner = product && authenticated && !isLoading ? getDepositAddress("base", accounts) : undefined;
  const current = snapshot?.period === period ? snapshot : null;
  const failed = Boolean(product && authenticated && !isLoading && !owner) || current?.failed === true;
  const history = current && !current.failed ? current.history : null;
  const latest = history?.points.at(-1)?.value;
  const chartLabel = failed
    ? "조회 실패"
    : !history
      ? "확인 중"
      : history.points.length === 0
        ? "표시할 기록이 없어요."
        : formatAssetUsd(latest ?? 0);
  const deposited = failed ? "조회 실패" : history ? formatUsdc(history.deposited, "keep", 6) : "확인 중";
  const interest = failed ? "조회 실패" : history ? formatUsdc(history.interest, "plus", 6) : "확인 중";
  const interestPositive = !failed && history !== null && history.interest > 0;

  return (
    <main className="wallet-page assets-page">
      <Link href="/product/assets" className="assets-back" aria-label="내 자산으로 돌아가기">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18 9 12 15 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        포트폴리오
      </Link>
      <div className="assets-identity">
        <ProductMark product={product} size={48} />
        <strong>{PORTFOLIO_PRODUCTS[product]}</strong>
      </div>
      <section className="assets-chart-block" aria-label="평가액">
        <div className="assets-chart-head">
          <strong>{chartLabel}</strong>
          <div className="assets-menu" ref={periodRef}>
            <button
              type="button"
              className="assets-period"
              aria-expanded={periodOpen}
              aria-haspopup="listbox"
              onClick={() => setPeriodOpen((open) => !open)}
            >
              {period}
              <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
                <path d="M0.75 0.75 4 4 7.25 0.75" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {periodOpen ? (
              <div className="assets-period-menu" role="listbox" aria-label="조회 기간">
                {HISTORY_PERIODS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    role="option"
                    aria-selected={label === period}
                    onClick={() => {
                      setPeriod(label);
                      setPeriodOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {!failed && history && history.points.length > 0 ? <ValueChart history={history} period={period} /> : null}
      </section>
      <section className="assets-info">
        <h2>고라니님의 공급 정보</h2>
        <dl>
          <div>
            <dt>투입 수량</dt>
            <dd>{deposited}</dd>
          </div>
          <div>
            <dt>누적 이자</dt>
            <dd className={interestPositive ? "assets-interest" : undefined}>{interest}</dd>
          </div>
          <div>
            <dt>공급 연수익률</dt>
            <dd>{apy ?? "확인 중"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
