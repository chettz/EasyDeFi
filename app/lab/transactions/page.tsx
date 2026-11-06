"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import {
  ACTIVITY_LABELS,
  ACTIVITY_STATUS_LABELS,
  type TransactionListItem,
} from "@/features/transactions/types";

const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1.5rem",
  border: "1px solid #888",
  padding: "0.75rem 1rem",
  color: "inherit",
  textDecoration: "none",
};

export default function TransactionsPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [transactions, setTransactions] = useState<TransactionListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
          setTransactions(null);
        }
        const response = await fetch("/api/transactions", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Transaction request failed: ${response.status}`);
        const body = (await response.json()) as {
          transactions: TransactionListItem[];
          nextCursor: string | null;
        };
        if (!cancelled) {
          setTransactions(body.transactions);
          setNextCursor(body.nextCursor);
        }
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  async function onLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Privy access token was not returned.");
      const response = await fetch(`/api/transactions?cursor=${encodeURIComponent(nextCursor)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Transaction request failed: ${response.status}`);
      const body = (await response.json()) as {
        transactions: TransactionListItem[];
        nextCursor: string | null;
      };
      setTransactions((current) => {
        const known = new Set((current ?? []).map((transaction) => transaction.id));
        return [...(current ?? []), ...body.transactions.filter((transaction) => !known.has(transaction.id))];
      });
      setNextCursor(body.nextCursor);
      setFailed(false);
    } catch (cause) {
      console.error(cause);
      setFailed(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

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
      <p><Link href="/lab">Lab</Link></p>
      <h1>거래내역</h1>
      {failed ? <p>거래내역을 불러오지 못했어요.</p> : null}
      {!failed && transactions === null ? <p>확인 중</p> : null}
      {!failed && transactions?.length === 0 ? <p>거래내역이 없어요.</p> : null}
      {transactions && transactions.length > 0 ? (
        <>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {transactions.map((transaction) => {
              const amount = formatUnits(BigInt(transaction.amount_raw), transaction.token_decimals);
              const usd = Number(amount).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              return (
                <Link key={transaction.id} href={`/lab/transactions/${transaction.id}`} style={row}>
                  <span>
                    <strong>{ACTIVITY_LABELS[transaction.type]}</strong>
                    <br />
                    {ACTIVITY_STATUS_LABELS[transaction.status]}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <strong>{amount} {transaction.token_symbol}</strong>
                    <br />
                    ${usd}
                    <br />
                    {new Date(transaction.occurred_at).toLocaleString("ko-KR")}
                  </span>
                </Link>
              );
            })}
          </div>
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void onLoadMore()}
              disabled={isLoadingMore}
              style={{ marginTop: "1rem", padding: "0.5rem 0.75rem" }}
            >
              {isLoadingMore ? "불러오는 중" : "더 보기"}
            </button>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
