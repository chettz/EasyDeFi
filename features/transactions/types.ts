export type ActivityType = "SUPPLY" | "REDEEM" | "DEPOSIT" | "WITHDRAW" | "BRIDGE";
export type ActivityStatus = "PENDING" | "CONFIRMED" | "FAILED";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  SUPPLY: "넣기",
  REDEEM: "꺼내기",
  DEPOSIT: "입금",
  WITHDRAW: "출금",
  BRIDGE: "네트워크 전환",
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: "진행 중",
  CONFIRMED: "완료",
  FAILED: "실패",
};

export type TransactionListItem = {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  network: string;
  token_symbol: string;
  amount_raw: string | number;
  token_decimals: number;
  occurred_at: string;
};

export type TransactionDetail = TransactionListItem & {
  primary_tx_hash: string | null;
  sender_address: string | null;
  recipient_address: string | null;
  fee_raw: string | number | null;
  fee_decimals: number | null;
  fee_symbol: string | null;
};
