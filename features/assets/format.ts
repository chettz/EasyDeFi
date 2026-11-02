import { formatUnits } from "viem";
import type { DepositNetwork } from "@/lib/deposit/networks";

export type AssetUnit = "USD" | "KRW" | "BTC";
export type AssetRates = { btcUsd: number; krwPerUsd: number };

const networkLabels: Partial<Record<DepositNetwork, string>> = {
  base: "base",
  카이아: "kaia",
  이더리움: "Ethereum",
  아크: "Arc",
  솔라나: "Solana",
};

export function asUsd(amount: bigint) {
  return Number(formatUnits(amount, 6));
}

export function formatUsd(value: number) {
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-$${text}` : `$${text}`;
}

export function formatQuantity(amount: bigint) {
  return asUsd(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function formatTotal(value: number, unit: AssetUnit, rates: AssetRates | null) {
  if (unit === "USD") {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (!rates) return "조회 실패";
  if (unit === "KRW") return Math.round(value * rates.krwPerUsd).toLocaleString("ko-KR");
  return (value / rates.btcUsd).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function networkLabel(network: DepositNetwork) {
  return networkLabels[network] ?? network;
}
