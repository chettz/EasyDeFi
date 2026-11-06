"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatUnits } from "viem";
import AssetLoader from "@/features/assets/loader";
import {
  activityTitle,
  amountParts,
  detailDate,
  networkName,
  shortenValue,
  statusClass,
  statusLabel,
} from "@/features/transactions/display";
import { type TransactionDetail } from "@/features/transactions/types";

export default function ProductTransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authenticated, getAccessToken } = usePrivy();
  const [snapshot, setSnapshot] = useState<
    { id: string; failed: false; transaction: TransactionDetail }
    | { id: string; failed: true }
    | null
  >(null);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    async function load() {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Privy access token was not returned.");
        const response = await fetch(`/api/transactions/${id}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Transaction request failed: ${response.status}`);
        const body = (await response.json()) as { transaction: TransactionDetail };
        if (!cancelled) setSnapshot({ id, failed: false, transaction: body.transaction });
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setSnapshot({ id, failed: true });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, id]);

  const current = snapshot?.id === id ? snapshot : null;
  const failed = current?.failed === true;
  const transaction = current && !current.failed ? current.transaction : null;
  if (!failed && !transaction) return <AssetLoader />;

  const amounts = transaction ? amountParts(transaction) : null;
  const fee =
    transaction?.fee_raw != null && transaction.fee_decimals != null
      ? `${formatUnits(BigInt(transaction.fee_raw), transaction.fee_decimals)} ${transaction.fee_symbol ?? ""}`.trim()
      : "-";

  return (
    <main className="wallet-page tx-page">
      <Link href="/product/transactions" className="tx-back" aria-label="거래내역으로 돌아가기">
        <Image src="/figma/tx-back.svg" alt="" width={24} height={24} />
        거래내역 상세
      </Link>
      {failed ? <p className="tx-note">거래내역을 찾지 못했어요.</p> : null}
      {transaction && amounts ? (
        <dl className="tx-detail">
          <div>
            <dt>거래 수량</dt>
            <dd className={amounts.incoming ? "tx-money-in" : undefined}>
              <b>{amounts.amount}</b>
              <small>{amounts.usd}</small>
            </dd>
          </div>
          <div>
            <dt>거래 유형</dt>
            <dd>{activityTitle(transaction.type, transaction.token_symbol)}</dd>
          </div>
          <div>
            <dt>거래 상태</dt>
            <dd className={statusClass(transaction.status)}>{statusLabel(transaction.status)}</dd>
          </div>
          <div>
            <dt>거래 일시</dt>
            <dd>{detailDate(transaction.occurred_at)}</dd>
          </div>
          <div>
            <dt>네트워크</dt>
            <dd>{networkName(transaction.network)}</dd>
          </div>
          <div>
            <dt>보낸 이</dt>
            <dd>{shortenValue(transaction.sender_address)}</dd>
          </div>
          <div>
            <dt>받는 이</dt>
            <dd>{shortenValue(transaction.recipient_address)}</dd>
          </div>
          <div>
            <dt>트랜잭션 해시</dt>
            <dd>{shortenValue(transaction.primary_tx_hash)}</dd>
          </div>
          <div>
            <dt>트랜잭션 수수료</dt>
            <dd>{fee}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
