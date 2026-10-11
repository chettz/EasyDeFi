"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { formatUnits } from "viem";
import { useUsdcPortfolioBalance } from "@/hooks/useUsdcPortfolioBalance";

function displayUsdc(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export default function ProductHome() {
  const { authenticated } = usePrivy();
  const { mainnetTotal, loading, failed } = useUsdcPortfolioBalance();

  return (
    <main className="wallet-page product-home">
      <section
        className={`product-asset-card${authenticated ? "" : " product-asset-card-logged-out"}`}
        aria-live="polite"
      >
        <span>내 자산</span>
        <strong>
          {!authenticated
            ? "0.00 USDC"
            : loading
              ? "확인 중"
              : `${displayUsdc(mainnetTotal ?? BigInt(0))} USDC`}
        </strong>
        {!authenticated && <small>로그인하면 자산이 보여요</small>}
      </section>
      {authenticated && (
        <div className="product-quick-actions">
          <Link href="/product/deposit">USDC 넣기</Link>
          <button type="button" disabled>
            바꾸기
          </button>
          <button type="button" disabled>
            내 수익
          </button>
        </div>
      )}
      {authenticated && failed && (
        <p className="wallet-alert" role="alert">
          일부 메인넷 잔액을 확인하지 못했어요.
        </p>
      )}
    </main>
  );
}
