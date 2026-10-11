"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useUsdcPortfolioBalance } from "@/hooks/useUsdcPortfolioBalance";

function displayUsdc(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export default function TransferPage() {
  const { mainnetTotal, testnetTotal, loading, failed } = useUsdcPortfolioBalance();

  return (
    <main className="wallet-page wallet-overview">
      <h1>입출금</h1>
      <p className="wallet-description">지갑으로 토큰을 넣거나 꺼낼 수 있어요.</p>
      <section className="wallet-balance-card" aria-live="polite">
        <span className="wallet-balance-label">메인넷 입출금 가능한 금액</span>
        <strong className="wallet-balance-value">
          {loading ? "확인 중" : `${displayUsdc(mainnetTotal ?? BigInt(0))} USDC`}
        </strong>
        <span className="wallet-testnet-balance">
          테스트넷 {loading ? "확인 중" : `${displayUsdc(testnetTotal ?? BigInt(0))} USDC`}
        </span>
      </section>
      {failed && (
        <p className="wallet-alert" role="alert">
          일부 네트워크의 잔액을 확인하지 못했어요.
        </p>
      )}
      <div className="wallet-actions">
        <Link href="/product/deposit" className="wallet-primary-button">
          입금
        </Link>
        <Link href="/product/withdraw" className="wallet-secondary-button">
          출금
        </Link>
      </div>
    </main>
  );
}
