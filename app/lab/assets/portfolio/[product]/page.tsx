"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import {
  getPositionHistory,
  HISTORY_PERIODS,
  PORTFOLIO_PRODUCTS,
  type HistoryPeriod,
  type PortfolioProduct,
  type PositionHistory,
} from "@/lib/portfolio/position-history";

const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1.5rem",
  border: "1px solid #888",
  padding: "0.75rem 1rem",
};

function isProduct(value: string): value is PortfolioProduct {
  return value in PORTFOLIO_PRODUCTS;
}

function formatUsd(value: number) {
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-$${text}` : `$${text}`;
}

function formatAxis(time: number, period: HistoryPeriod, span: number) {
  const date = new Date(time * 1000);
  if (period === "1D") return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (period === "1Y" || (period === "ALL" && span > 400 * 24 * 60 * 60)) {
    return date.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric" });
  }
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function ValueChart({ history, period }: { history: PositionHistory; period: HistoryPeriod }) {
  const width = 1000;
  const height = 240;
  const padX = 12;
  const plotTop = 16;
  const plotBottom = 188;
  const start = history.start;
  const end = history.end > start ? history.end : start + 1;
  const values = history.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(Math.abs(max) * 0.05, 1) : (max - min) * 0.08;
  const low = min - pad;
  const high = max + pad;
  const xOf = (time: number) => padX + ((Math.min(end, Math.max(start, time)) - start) / (end - start)) * (width - padX * 2);
  const yOf = (value: number) => plotTop + (1 - (value - low) / (high - low)) * (plotBottom - plotTop);
  const line = history.points
    .map((point) => `${xOf(point.time)},${yOf(point.value)}`)
    .join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => start + (end - start) * ratio);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="자산 변화" style={{ width: "100%", height: 280, border: "1px solid #888" }}>
      {history.points.length > 1 ? (
        <polyline fill="none" stroke="#1f1f24" strokeWidth="3" points={line} />
      ) : (
        <line x1={padX} x2={width - padX} y1={yOf(values[0] ?? 0)} y2={yOf(values[0] ?? 0)} stroke="#1f1f24" strokeWidth="3" />
      )}
      {ticks.map((time, index) => (
        <text
          key={time}
          x={xOf(time)}
          y="222"
          textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}
          fontSize="18"
          fill="#444"
        >
          {formatAxis(time, period, end - start)}
        </text>
      ))}
    </svg>
  );
}

export default function PortfolioProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product: productParam } = use(params);
  const product = isProduct(productParam) ? productParam : null;
  const { ready, authenticated, login } = usePrivy();
  const { accounts, isLoading } = useDepositAccounts();
  const [period, setPeriod] = useState<HistoryPeriod>("1W");
  const [history, setHistory] = useState<PositionHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!product || !authenticated || isLoading) return;
    const selectedProduct = product;
    const owner = getDepositAddress("base", accounts);
    let cancelled = false;

    async function load() {
      await Promise.resolve();
      if (cancelled) return;
      setFailed(false);
      setHistory(null);
      if (!owner) {
        setFailed(true);
        return;
      }
      try {
        const loaded = await getPositionHistory(selectedProduct, owner, period);
        if (!cancelled) setHistory(loaded);
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accounts, authenticated, isLoading, period, product]);

  if (!product) return <p>없는 상품이에요.</p>;
  if (!ready) return <p>확인 중</p>;
  if (!authenticated) {
    return (
      <main style={page}>
        <button type="button" onClick={login}>Login</button>
      </main>
    );
  }

  return (
    <main style={page}>
      <p>
        <Link href="/lab/assets">내 자산</Link>
      </p>
      <h1>{PORTFOLIO_PRODUCTS[product]}</h1>
      <div style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
        {HISTORY_PERIODS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setPeriod(label)}
            style={{
              flex: 1,
              border: "1px solid #444",
              padding: "0.5rem 0.75rem",
              background: label === period ? "#1f1f24" : "#fff",
              color: label === period ? "#fff" : "#1f1f24",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {failed ? <p>조회 실패</p> : null}
      {!failed && (isLoading || history === null) ? <p>확인 중</p> : null}
      {!failed && history && history.points.length === 0 ? <p>표시할 기록이 없어요.</p> : null}
      {!failed && history && history.points.length > 0 ? <ValueChart history={history} period={period} /> : null}
      {!failed && history ? (
        <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
          <div style={row}>
            <span>예치한 금액</span>
            <strong>{formatUsd(history.deposited)}</strong>
          </div>
          <div style={row}>
            <span>이자</span>
            <strong>{formatUsd(history.interest)}</strong>
          </div>
        </div>
      ) : null}
    </main>
  );
}
