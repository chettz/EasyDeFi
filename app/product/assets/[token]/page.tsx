"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { ASSET_MAINNETS, TOKEN_NETWORKS, type DepositNetwork, type DepositToken } from "@/lib/deposit/networks";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";
import { asUsd, formatQuantity, formatUsd, networkLabel } from "@/features/assets/format";
import AssetLoader from "@/features/assets/loader";
import { NetworkMark, TokenMark } from "@/features/assets/marks";

function isToken(value: string): value is DepositToken {
  return value === "USDC" || value === "USDT";
}

export default function ProductTokenAssetsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenParam } = use(params);
  const token = isToken(tokenParam) ? tokenParam : null;
  const { accounts, isLoading } = useDepositAccounts();
  const [rows, setRows] = useState<{ network: DepositNetwork; amount: bigint | undefined }[] | null>(null);

  useEffect(() => {
    if (!token || isLoading) return;
    let cancelled = false;
    const networkOrder: DepositNetwork[] = ["base", "카이아", "이더리움", "아크", "솔라나"];
    const networks = TOKEN_NETWORKS[token]
      .filter((network) => ASSET_MAINNETS.has(network))
      .sort((a, b) => networkOrder.indexOf(a) - networkOrder.indexOf(b));
    Promise.all(
      networks.map(async (network) => {
        const owner = getDepositAddress(network, accounts);
        const amount = owner ? await getDepositTokenBalance(token, network, owner) : undefined;
        return { network, amount };
      }),
    ).then((loaded) => {
      if (!cancelled) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [accounts, isLoading, token]);

  if (!token) {
    return (
      <main className="wallet-page assets-page assets-token">
        <p className="assets-empty">없는 토큰이에요.</p>
      </main>
    );
  }
  if (isLoading || rows === null) return <AssetLoader />;

  const known = rows.flatMap((row) => (row.amount === undefined ? [] : [row.amount]));
  const total = known.reduce((sum, amount) => sum + amount, BigInt(0));

  return (
    <main className="wallet-page assets-page assets-token">
      <Link href="/product/assets" className="assets-back" aria-label="내 자산으로 돌아가기">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18 9 12 15 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        자산
      </Link>
      <section className="assets-summary">
        <div className="assets-identity">
          <TokenMark token={token} size={48} />
          <strong>{token}</strong>
        </div>
        {known.length === 0 ? (
          <p className="assets-summary-amount">조회 실패</p>
        ) : (
          <>
            <p className="assets-summary-amount">{formatQuantity(total)}</p>
            <p className="assets-summary-usd">{formatUsd(asUsd(total))}</p>
          </>
        )}
      </section>
      <section className="assets-networks" aria-label="네트워크별 수량">
        <div className="assets-network-head">
          <span>이름</span>
          <span>네트워크</span>
          <span>수량</span>
        </div>
        {rows.map((row) => (
          <div key={row.network} className="assets-network-row">
            <span>
              <TokenMark token={token} size={24} />
              {token}
            </span>
            <span>
              <NetworkMark network={row.network} />
              {networkLabel(row.network)}
            </span>
            {row.amount === undefined ? (
              <strong>조회 실패</strong>
            ) : (
              <span className="assets-network-amount">
                <b>{formatQuantity(row.amount)}</b>
                <small>{formatUsd(asUsd(row.amount))}</small>
              </span>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
