import Link from "next/link";
import { getBaseUsdcReserveDetail, type AaveApyWindow } from "@/lib/aave/base-usdc-reserve";

const windows: AaveApyWindow[] = ["1주", "1달", "6개월", "1년"];
const cellStyle = { border: "1px solid #888", padding: "0.5rem", textAlign: "left" as const };

function isWindow(value: string | undefined): value is AaveApyWindow {
  return windows.includes(value as AaveApyWindow);
}

function formatAmount(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// 왼쪽이 과거, 오른쪽이 최근이다. apy는 "4.85" 같은 퍼센트 숫자다.
function ApyChart({ points }: { points: { date: string; apy: string }[] }) {
  const values = points.map((point) => Number(point.apy));
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return null;

  const width = 640;
  const height = 180;
  const pad = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const line = values
    .map((value, index) => {
      const x = pad + (index / (values.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="연 수익률 변화" style={{ width: "100%", height: 180, border: "1px solid #888" }}>
      <polyline fill="none" stroke="#1f1f24" strokeWidth="2" points={line} />
    </svg>
  );
}

export default async function AaveReservePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  // 주소에 기간이 없거나 네 값 중 하나가 아니면 1주다.
  const window = isWindow(params.window) ? params.window : "1주";

  let detail: Awaited<ReturnType<typeof getBaseUsdcReserveDetail>> | null = null;
  try {
    detail = await getBaseUsdcReserveDetail(window);
  } catch (cause) {
    console.error(cause);
  }

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Aave USDC 풀(Base)</h1>
      <p style={{ display: "flex", gap: "0.5rem" }}>
        {windows.map((label) => (
          <Link
            key={label}
            href={label === "1주" ? "/lab/defi-list/aave" : `/lab/defi-list/aave?window=${encodeURIComponent(label)}`}
            style={{
              border: "1px solid #444",
              padding: "0.5rem 0.75rem",
              background: label === window ? "#1f1f24" : "#fff",
              color: label === window ? "#fff" : "#1f1f24",
            }}
          >
            {label}
          </Link>
        ))}
      </p>
      {detail ? (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <tbody>
              <tr>
                <th style={cellStyle}>예치 물량</th>
                <td style={cellStyle}>{formatAmount(detail.suppliedAmount)} USDC</td>
              </tr>
              <tr>
                <th style={cellStyle}>Reserve size</th>
                <td style={cellStyle}>${formatAmount(detail.reserveSizeUsd)}</td>
              </tr>
              <tr>
                <th style={cellStyle}>Available liquidity</th>
                <td style={cellStyle}>{formatAmount(detail.availableLiquidity)} USDC</td>
              </tr>
              <tr>
                <th style={cellStyle}>Utilization rate</th>
                <td style={cellStyle}>{detail.utilizationRate}</td>
              </tr>
              <tr>
                <th style={cellStyle}>예치 시 받는 토큰</th>
                <td style={cellStyle}>{detail.aTokenSymbol}</td>
              </tr>
            </tbody>
          </table>
          <h2 style={{ marginTop: "1.5rem" }}>연 수익률</h2>
          <ApyChart points={detail.apyHistory} />
        </>
      ) : (
        <p>조회 실패</p>
      )}
    </main>
  );
}
