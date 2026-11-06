"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AssetLoader from "@/features/assets/loader";
import {
  activityIcon,
  activityTitle,
  amountParts,
  listDate,
  statusClass,
  statusLabel,
} from "@/features/transactions/display";
import { type ActivityType, type TransactionListItem } from "@/features/transactions/types";

type TypeFilter = "ALL" | ActivityType;

const filters = [
  { id: "ALL", label: "전체" },
  { id: "SUPPLY", label: "넣기" },
  { id: "REDEEM", label: "꺼내기" },
  { id: "BRIDGE", label: "브릿지" },
  { id: "DEPOSIT", label: "입금" },
  { id: "WITHDRAW", label: "출금" },
] as const satisfies readonly { id: TypeFilter; label: string }[];

type ListState = {
  transactions: TransactionListItem[];
  nextCursor: string | null;
  failed: boolean;
};

export default function ProductTransactionsPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [list, setList] = useState<ListState | null>(null);
  const [filter, setFilter] = useState<TypeFilter>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    async function load() {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Privy access token was not returned.");
        const response = await fetch("/api/transactions", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Transaction request failed: ${response.status}`);
        const body = (await response.json()) as {
          transactions: TransactionListItem[];
          nextCursor: string | null;
        };
        if (!cancelled) setList({ transactions: body.transactions, nextCursor: body.nextCursor, failed: false });
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setList({ transactions: [], nextCursor: null, failed: true });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    if (!filterOpen) return;
    function close(event: MouseEvent) {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  async function onLoadMore() {
    if (!list?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Privy access token was not returned.");
      const response = await fetch(`/api/transactions?cursor=${encodeURIComponent(list.nextCursor)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Transaction request failed: ${response.status}`);
      const body = (await response.json()) as {
        transactions: TransactionListItem[];
        nextCursor: string | null;
      };
      setList((current) => {
        const known = new Set((current?.transactions ?? []).map((transaction) => transaction.id));
        return {
          transactions: [...(current?.transactions ?? []), ...body.transactions.filter((transaction) => !known.has(transaction.id))],
          nextCursor: body.nextCursor,
          failed: false,
        };
      });
    } catch (cause) {
      console.error(cause);
      setList((current) => (current ? { ...current, failed: true } : current));
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (!list) return <AssetLoader />;

  const visible = list.transactions.filter((transaction) => filter === "ALL" || transaction.type === filter);

  return (
    <main className="wallet-page tx-page">
      <header className="tx-heading">
        <h1>거래내역</h1>
        <p>
          넣기·꺼내기·브릿지·입출금 내역이에요.
          <br />
          눌러서 자세히 볼 수 있어요.
        </p>
      </header>
      <div className="tx-filter" ref={filterRef}>
        <button
          type="button"
          className="tx-filter-button"
          aria-expanded={filterOpen}
          aria-haspopup="listbox"
          onClick={() => setFilterOpen((open) => !open)}
        >
          거래 유형
          <Image src="/figma/tx-caret.svg" alt="" width={8} height={5} />
        </button>
        {filterOpen ? (
          <div className="tx-filter-menu" role="listbox" aria-label="거래 유형">
            {filters.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === filter}
                onClick={() => {
                  setFilter(option.id);
                  setFilterOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {list.failed ? <p className="tx-note">거래내역을 불러오지 못했어요.</p> : null}
      {!list.failed && visible.length === 0 ? <p className="tx-note">거래내역이 없어요.</p> : null}
      {visible.length > 0 ? (
        <div className="tx-list">
          {visible.map((transaction) => {
            const amounts = amountParts(transaction);
            return (
              <Link key={transaction.id} href={`/product/transactions/${transaction.id}`}>
                <span className="tx-icon">
                  <Image src={activityIcon(transaction.type)} alt="" width={16} height={16} />
                </span>
                <span className="tx-copy">
                  <strong>{activityTitle(transaction.type, transaction.token_symbol)}</strong>
                  <span>
                    <small>{listDate(transaction.occurred_at, transaction.status)}</small>
                    {transaction.status !== "CONFIRMED" ? (
                      <small className={statusClass(transaction.status)}>{statusLabel(transaction.status)}</small>
                    ) : null}
                  </span>
                </span>
                <span className={amounts.incoming ? "tx-money tx-money-in" : "tx-money"}>
                  <b>{amounts.amount}</b>
                  <small>{amounts.usd}</small>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
      {list.nextCursor ? (
        <button type="button" className="tx-more" onClick={() => void onLoadMore()} disabled={isLoadingMore}>
          {isLoadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}
    </main>
  );
}
