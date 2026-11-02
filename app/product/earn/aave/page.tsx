import Link from "next/link";
import { getBaseUsdcReserveDetail } from "@/lib/aave/base-usdc-reserve";
import { getBaseUsdcSupplyApy } from "@/lib/aave/base-usdc-supply-apy";
import { AaveYieldHero } from "./yield-hero";

const FAILED = "조회 실패";

const yieldSteps = [
  "내 USDC를 Aave Base USDC pool에 넣어요",
  "다른 사람이 pool에서 USDC를 빌려가요",
  "빌린 사람이 지불하는 이자의 90%가 나의 몫이에요\n(10%는 Aave DAO)",
] as const;

async function loadApy() {
  try {
    return await getBaseUsdcSupplyApy();
  } catch (cause) {
    console.error(cause);
    return FAILED;
  }
}

function formatUsdcAmount(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}억 USDC`;
  if (value >= 10_000) {
    return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만 USDC`;
  }
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} USDC`;
}

async function loadReserve() {
  try {
    return await getBaseUsdcReserveDetail("1년");
  } catch (cause) {
    console.error(cause);
    return null;
  }
}

export default async function AaveEarnDetailPage() {
  const [apy, reserve] = await Promise.all([loadApy(), loadReserve()]);
  const poolRows = [
    ["풀에 들어간 금액", reserve ? formatUsdcAmount(reserve.suppliedAmount) : null],
    ["지금 꺼낼 수 있는 금액", reserve ? formatUsdcAmount(reserve.availableLiquidity) : null],
    ["빌려 간 비율", reserve?.utilizationRate ?? null],
  ] as const;

  return (
    <main className="wallet-page earn-detail">
      <Link href="/product/earn" className="earn-detail-title" aria-label="예치 목록으로 돌아가기">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15 18 9 12 15 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Aave Base USDC
      </Link>
      <AaveYieldHero apy={apy} initialHistory={reserve?.apyHistory ?? null} />
      <section className="earn-detail-metrics" aria-label="풀 정보">
        <div className="earn-detail-group">
          <h2>Pool 상태</h2>
          {poolRows.map(([label, value]) => (
            <div key={label} className="earn-detail-row">
              <span className="earn-detail-label">
                {label}
                <span className="earn-detail-help" aria-hidden="true">
                  ?
                </span>
              </span>
              <strong>{value ?? FAILED}</strong>
            </div>
          ))}
        </div>
        <div className="earn-detail-group">
          <h2>공급 정보</h2>
          <div className="earn-detail-row">
            <span className="earn-detail-label">
              연 수익률
              <span className="earn-detail-help" aria-hidden="true">
                ?
              </span>
            </span>
            <strong className="earn-detail-apy-value">{apy}</strong>
          </div>
          <div className="earn-detail-row">
            <span className="earn-detail-label">
              받는 토큰
              <span className="earn-detail-help" aria-hidden="true">
                ?
              </span>
            </span>
            <strong>{reserve ? `${reserve.aTokenSymbol}(Aave 예치 토큰)` : FAILED}</strong>
          </div>
        </div>
      </section>
      <section className="earn-detail-yield" aria-labelledby="yield-source-title">
        <div className="earn-detail-yield-title">
          <h2 id="yield-source-title">수익은 어떻게 발생하나요?</h2>
          <button type="button" className="earn-detail-more" aria-label="수익이 생기는 원리 더 보기">
            ›
          </button>
        </div>
        <ol>
          {yieldSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>
      <Link href="/product/earn/aave/supply" className="earn-detail-submit">
        USDC 넣기/꺼내기
      </Link>
    </main>
  );
}
