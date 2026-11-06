"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatUnits } from "viem";
import {
  ACTIVITY_LABELS,
  ACTIVITY_STATUS_LABELS,
  type TransactionDetail,
} from "@/features/transactions/types";

const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const row = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1.5rem",
  borderBottom: "1px solid #888",
  padding: "0.75rem 0",
};

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    async function load() {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Privy access token was not returned.");
        if (!cancelled) {
          setFailed(false);
          setTransaction(null);
        }
        const response = await fetch(`/api/transactions/${id}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Transaction request failed: ${response.status}`);
        const body = (await response.json()) as { transaction: TransactionDetail };
        if (!cancelled) setTransaction(body.transaction);
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, id]);

  if (!ready) return <p>확인 중</p>;
  if (!authenticated) {
    return (
      <main style={page}>
        <button type="button" onClick={login}>Login</button>
      </main>
    );
  }

  const amount = transaction
    ? `${formatUnits(BigInt(transaction.amount_raw), transaction.token_decimals)} ${transaction.token_symbol}`
    : "";
  const fee =
    transaction?.fee_raw != null && transaction.fee_decimals != null
      ? `${formatUnits(BigInt(transaction.fee_raw), transaction.fee_decimals)} ${transaction.fee_symbol ?? ""}`
      : "-";
  const fields = transaction
    ? [
        ["거래수량", amount],
        ["거래 유형", ACTIVITY_LABELS[transaction.type]],
        ["거래 상태", ACTIVITY_STATUS_LABELS[transaction.status]],
        ["거래 일시", new Date(transaction.occurred_at).toLocaleString("ko-KR")],
        ["네트워크", transaction.network],
        ["보낸 이", transaction.sender_address ?? "-"],
        ["받는 이", transaction.recipient_address ?? "-"],
        ["트랜잭션 해시", transaction.primary_tx_hash ?? "-"],
        ["트랜잭션 수수료", fee],
      ]
    : [];

  return (
    <main style={page}>
      <p><Link href="/lab/transactions">거래내역</Link></p>
      <h1>거래내역 상세</h1>
      {failed ? <p>거래내역을 찾지 못했어요.</p> : null}
      {!failed && transaction === null ? <p>확인 중</p> : null}
      {transaction ? (
        <dl style={{ border: "1px solid #888", padding: "0 1rem", margin: 0 }}>
          {fields.map(([label, value]) => (
            <div key={label} style={row}>
              <dt>{label}</dt>
              <dd style={{ margin: 0, textAlign: "right", overflowWrap: "anywhere" }}>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </main>
  );
}
