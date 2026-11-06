import { getBaseUsdcSupplyApy } from "@/lib/aave/base-usdc-supply-apy";
import { AaveSupplyScreen } from "./supply-screen";

export const dynamic = "force-dynamic";

function formatReferenceTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")} 기준 · 상시 변동`;
}

export default async function AaveSupplyPage() {
  let supplyApy = "조회 실패";
  try {
    supplyApy = await getBaseUsdcSupplyApy();
  } catch (cause) {
    console.error(cause);
  }

  return <AaveSupplyScreen supplyApy={supplyApy} referenceTime={formatReferenceTime(new Date())} />;
}
