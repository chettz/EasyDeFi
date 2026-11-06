import { formatUnits } from "viem";
import { ACTIVITY_STATUS_LABELS, type ActivityStatus, type ActivityType, type TransactionListItem } from "./types";

export function activityTitle(type: ActivityType, symbol: string) {
  if (type === "SUPPLY") return `${symbol} 넣기`;
  if (type === "REDEEM") return `${symbol} 꺼내기`;
  if (type === "BRIDGE") return "브릿지";
  return type === "DEPOSIT" ? "입금" : "출금";
}

export function activityIcon(type: ActivityType) {
  if (type === "BRIDGE") return "/figma/tx-arrow-right.svg";
  if (type === "REDEEM" || type === "WITHDRAW") return "/figma/tx-arrow-up.svg";
  return "/figma/tx-arrow-down.svg";
}

export function amountParts(transaction: Pick<TransactionListItem, "amount_raw" | "token_decimals" | "token_symbol" | "type" | "status">) {
  const value = Number(formatUnits(BigInt(transaction.amount_raw), transaction.token_decimals));
  const digits = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const signed = transaction.status !== "FAILED" && (transaction.type === "DEPOSIT" || transaction.type === "WITHDRAW");
  const sign = !signed ? "" : transaction.type === "DEPOSIT" ? "+" : "-";
  return {
    amount: `${sign}${digits} ${transaction.token_symbol}`,
    usd: `${sign}$${digits}`,
    incoming: sign === "+",
  };
}

export function listDate(occurredAt: string, status: ActivityStatus) {
  const time = Date.parse(occurredAt);
  if (!Number.isFinite(time)) return occurredAt;
  if (status === "PENDING" && Date.now() - time < 60_000) return "방금 전";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

export function detailDate(occurredAt: string) {
  const time = Date.parse(occurredAt);
  if (!Number.isFinite(time)) return occurredAt;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
}

export function networkName(network: string) {
  return network === "base" ? "Base" : network;
}

export function shortenValue(value: string | null) {
  if (!value) return "-";
  if (value.startsWith("0x") && value.length > 12) return `${value.slice(0, 6)}…${value.slice(-4)}`;
  return value;
}

export function statusClass(status: ActivityStatus) {
  if (status === "FAILED") return "tx-status-failed";
  if (status === "PENDING") return "tx-status-pending";
  return "tx-status-done";
}

export function statusLabel(status: ActivityStatus) {
  return ACTIVITY_STATUS_LABELS[status];
}
