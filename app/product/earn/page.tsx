import Image from "next/image";
import { getBaseUsdcSupplyApy } from "@/lib/aave/base-usdc-supply-apy";
import { getMorphoVaultV2Apy } from "@/lib/morpho/vault-v2-apy";

const STEAKHOUSE_PRIME_USDC = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
const BASE_CHAIN_ID = 8453;
const FAILED_APY = "조회 실패";

const products = [
  {
    id: "aave",
    protocol: "Aave",
    name: "USDC pool",
    logo: "/figma/aave-badge.svg",
    apyClassName: "earn-apy-aave",
  },
  {
    id: "morpho",
    protocol: "Morpho",
    name: "Steakhouse Prime USDC",
    logo: "/figma/morpho-badge.svg",
    apyClassName: "earn-apy-morpho",
  },
] as const;

function formatReferenceTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("month")}-${value("day")} ${value("hour")}:${value("minute")} 기준`;
}

async function loadApy(load: () => Promise<string>) {
  try {
    return { apy: await load(), ok: true };
  } catch (cause) {
    console.error(cause);
    return { apy: FAILED_APY, ok: false };
  }
}

export default async function EarnPage() {
  const [aave, morpho] = await Promise.all([
    loadApy(() => getBaseUsdcSupplyApy()),
    loadApy(() => getMorphoVaultV2Apy(STEAKHOUSE_PRIME_USDC, BASE_CHAIN_ID)),
  ]);
  const yields = { aave: aave.apy, morpho: morpho.apy };
  const referenceTime = aave.ok || morpho.ok ? formatReferenceTime(new Date()) : null;

  return (
    <main className="wallet-page earn-page">
      <div className="earn-heading">
        <h1>예치</h1>
        {referenceTime && <p>{referenceTime}</p>}
      </div>
      <ul className="earn-list">
        {products.map((product) => (
          <li key={product.id} className="earn-card">
            <div className="earn-badge-block">
              <Image src={product.logo} alt="" width={40} height={40} unoptimized />
              <span>{product.protocol}</span>
            </div>
            <div className="earn-product">
              <strong>{product.name}</strong>
              <span>체인 : Base</span>
            </div>
            <strong className={`earn-apy ${product.apyClassName}`}>{yields[product.id]}</strong>
          </li>
        ))}
      </ul>
      <p className="earn-disclaimer">
        표시된 연 수익률은 초 단위로 변해요.
      </p>
    </main>
  );
}
