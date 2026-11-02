"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AaveApyWindow } from "@/lib/aave/base-usdc-reserve";
import { loadAaveApyHistory } from "./actions";

const PERIODS = [
  { id: "1W", window: "1주", axis: ["7일 전", "3일 전", "오늘"] },
  { id: "1M", window: "1달", axis: ["1달 전", "2주 전", "오늘"] },
  { id: "6M", window: "6개월", axis: ["6개월 전", "3개월 전", "오늘"] },
  { id: "1Y", window: "1년", axis: ["1년 전", "6개월 전", "오늘"] },
] as const satisfies readonly { id: string; window: AaveApyWindow; axis: readonly [string, string, string] }[];

type PeriodId = (typeof PERIODS)[number]["id"];
export type ApyPoint = { date: string; apy: string };

const FAILED = "조회 실패";
const CHART_WIDTH = 318;
const CHART_HEIGHT = 101;
const chartDateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  const base = error <= 1 ? 1 : error <= 2 ? 2 : error <= 2.5 ? 2.5 : error <= 5 ? 5 : 10;
  return base * power;
}

function axisScale(min: number, max: number) {
  let step = niceStep(Math.max(max - min, 0.4) / 3);
  let niceMin = Math.floor(min / step) * step;
  let niceMax = Math.ceil(max / step) * step;
  if (niceMax <= niceMin) {
    niceMin -= step;
    niceMax += step;
  }
  let intervals = Math.round((niceMax - niceMin) / step);
  while (intervals > 4) {
    step *= 2;
    niceMin = Math.floor(min / step) * step;
    niceMax = Math.ceil(max / step) * step;
    if (niceMax <= niceMin) {
      niceMin -= step;
      niceMax += step;
    }
    intervals = Math.round((niceMax - niceMin) / step);
  }
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => {
    return Math.round((niceMax - index * step) * 1000) / 1000;
  });
  return { min: ticks[ticks.length - 1], max: ticks[0], ticks };
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  const places = Number.isInteger(rounded * 10) ? 1 : 2;
  return `${rounded.toFixed(places)}%`;
}

function formatChartDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return chartDateFormat.format(date);
}

function chartPath(points: ApyPoint[]) {
  const series = points.flatMap((point) => {
    const apy = Number(point.apy);
    return Number.isFinite(apy) ? [{ date: point.date, apy }] : [];
  });
  if (series.length === 0) return null;
  const padTop = 12;
  const padBottom = 2;
  const scale = axisScale(Math.min(...series.map((point) => point.apy)), Math.max(...series.map((point) => point.apy)));
  const span = scale.max - scale.min || 1;
  const yOf = (value: number) => padTop + (1 - (value - scale.min) / span) * (CHART_HEIGHT - padTop - padBottom);
  const plotted = series.map((point, index) => {
    const x = series.length === 1 ? CHART_WIDTH / 2 : (index / (series.length - 1)) * CHART_WIDTH;
    return { ...point, x, y: yOf(point.apy) };
  });
  const line = plotted.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = plotted[plotted.length - 1];
  const first = plotted[0];
  const baseline = yOf(scale.min).toFixed(1);
  const area = `${line} L${last.x.toFixed(1)} ${baseline} L${first.x.toFixed(1)} ${baseline} Z`;
  return {
    line,
    area,
    last,
    points: plotted,
    ticks: scale.ticks.map((value) => ({ value, label: formatPercent(value), y: yOf(value) })),
  };
}

export function AaveYieldHero({
  apy,
  initialHistory,
}: {
  apy: string;
  initialHistory: ApyPoint[] | null;
}) {
  const [period, setPeriod] = useState<PeriodId>("1Y");
  const [history, setHistory] = useState<ApyPoint[] | null>(initialHistory);
  const [status, setStatus] = useState<"ready" | "loading" | "error">(initialHistory?.length ? "ready" : "error");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const cache = useRef(new Map<PeriodId, ApyPoint[]>(initialHistory ? [["1Y", initialHistory]] : []));
  const requestId = useRef(0);
  const selected = PERIODS.find((item) => item.id === period) ?? PERIODS[3];
  const chart = history ? chartPath(history) : null;
  const hover = chart && hoverIndex !== null ? chart.points[hoverIndex] : null;

  function hoverChart(event: PointerEvent<HTMLDivElement>) {
    if (!chart) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    let nearest = 0;
    let distance = Infinity;
    chart.points.forEach((point, index) => {
      const gap = Math.abs(point.x - x);
      if (gap < distance) {
        distance = gap;
        nearest = index;
      }
    });
    setHoverIndex(nearest);
  }

  async function selectPeriod(next: PeriodId) {
    if (next === period) return;
    const nextIndex = PERIODS.findIndex((item) => item.id === next);
    setHoverIndex(null);
    setPeriod(next);
    const cached = cache.current.get(next);
    if (cached) {
      setHistory(cached);
      setStatus(cached.length ? "ready" : "error");
      return;
    }
    const id = ++requestId.current;
    setStatus("loading");
    try {
      const nextHistory = await loadAaveApyHistory(PERIODS[nextIndex].window);
      if (id !== requestId.current) return;
      cache.current.set(next, nextHistory);
      setHistory(nextHistory);
      setStatus(nextHistory.length ? "ready" : "error");
    } catch (cause) {
      console.error(cause);
      if (id !== requestId.current) return;
      setHistory(null);
      setStatus("error");
    }
  }

  return (
    <section className="earn-detail-hero" aria-label="연 수익률">
      <div className="earn-detail-hero-top">
        <p>
          연 수익률
          <span className="earn-detail-help earn-detail-help-light" aria-hidden="true">
            ?
          </span>
        </p>
        <div className="earn-detail-periods" role="group" aria-label="수익률 기간">
          <span
            className="earn-detail-period-highlight"
            style={{ "--period-index": String(PERIODS.findIndex((item) => item.id === period)) } as CSSProperties}
          />
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === period}
              onClick={() => selectPeriod(item.id)}
            >
              {item.id}
            </button>
          ))}
        </div>
      </div>
      <p className="earn-detail-apy">{apy}</p>
      <div className={`earn-detail-graph${chart && status === "ready" ? " has-scale" : ""}`}>
        <div className="earn-detail-chart" aria-busy={status === "loading"}>
          {status === "loading" ? (
            <div className="earn-detail-chart-loading" role="status" aria-label="그래프를 불러오는 중">
              <span className="earn-detail-spinner" />
            </div>
          ) : chart ? (
            <>
              <div className="earn-detail-yaxis" aria-hidden="true">
                <span className="earn-detail-yaxis-sizer">
                  {chart.ticks.map((tick) => (
                    <span key={tick.label}>{tick.label}</span>
                  ))}
                </span>
                {chart.ticks.map((tick) => (
                  <span key={tick.label} style={{ top: tick.y }}>
                    {tick.label}
                  </span>
                ))}
              </div>
              <div
                className="earn-detail-plot"
                onPointerMove={hoverChart}
                onPointerLeave={() => setHoverIndex(null)}
              >
                <svg
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${selected.id} 공급 연 수익률 그래프`}
                >
                  <path d={chart.area} fill="rgb(255 255 255 / 28%)" />
                  <path d={chart.line} fill="none" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  <circle cx={chart.last.x} cy={chart.last.y} r="3" fill="#fff" />
                </svg>
                {hover ? (
                  <>
                    <span
                      className="earn-detail-guide"
                      style={{ left: `${(hover.x / CHART_WIDTH) * 100}%` }}
                    />
                    <span
                      className="earn-detail-hover-dot"
                      style={{
                        left: `${(hover.x / CHART_WIDTH) * 100}%`,
                        top: `${(hover.y / CHART_HEIGHT) * 100}%`,
                      }}
                    />
                    <p
                      className={`earn-detail-tip${hover.y < 42 ? " is-below" : ""}${hover.x < 70 ? " is-start" : ""}${hover.x > CHART_WIDTH - 70 ? " is-end" : ""}`}
                      style={{
                        left: `${(hover.x / CHART_WIDTH) * 100}%`,
                        top: `${(hover.y / CHART_HEIGHT) * 100}%`,
                      }}
                    >
                      <span>{formatChartDate(hover.date)}</span>
                      <strong>공급 연이율 {formatPercent(hover.apy)}</strong>
                    </p>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="earn-detail-chart-status">{FAILED}</p>
          )}
        </div>
        <div className="earn-detail-axis">
          {selected.axis.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
