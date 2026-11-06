"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useUsdcPortfolioBalance } from "@/hooks/useUsdcPortfolioBalance";

function displayUsdc(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export default function TransferPage() {
  const { mainnetTotal, loading, failed } = useUsdcPortfolioBalance();

  return (
    <main className="wallet-page move-page">
      <h1>입출금</h1>
      <section className="wallet-balance-card" aria-live="polite">
        <span className="wallet-balance-label">입출금 가능한 금액</span>
        <strong className="wallet-balance-value">
          {loading ? "확인 중" : `${displayUsdc(mainnetTotal ?? BigInt(0))} USDC`}
        </strong>
      </section>
      {failed && (
        <p className="wallet-alert" role="alert">
          일부 네트워크의 잔액을 확인하지 못했어요.
        </p>
      )}
      <div className="move-actions">
        <Link href="/product/deposit" className="move-pill">
          입금
        </Link>
        <Link href="/product/withdraw" className="move-pill move-pill-quiet">
          출금
        </Link>
      </div>
    </main>
  );
}
