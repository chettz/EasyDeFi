"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { formatUnits } from "viem";
import { useUsdcPortfolioBalance } from "@/hooks/useUsdcPortfolioBalance";

function displayUsdc(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

const actions = [
  { href: "/product/deposit", label: "넣기", icon: "down" },
  { href: "/product/withdraw", label: "출금", icon: "up" },
  { href: "/product/earn", label: "예치", icon: "earn" },
] as const;

function ActionIcon({ name }: { name: (typeof actions)[number]["icon"] }) {
  if (name === "down") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 5v11M7.5 12.5 12 17l4.5-4.5" />
      </svg>
    );
  }
  if (name === "up") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 19V8M7.5 11.5 12 7l4.5 4.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 16.5 10 11l3.2 3.2L19 8" />
    </svg>
  );
}

export default function ProductHome() {
  const { authenticated } = usePrivy();
  const { mainnetTotal, loading, failed } = useUsdcPortfolioBalance();
  const amount = !authenticated ? "0.00" : loading ? null : displayUsdc(mainnetTotal ?? BigInt(0));

  return (
    <main className="wallet-page product-home">
      <section className="home-balance" aria-live="polite">
        <p>총 잔액</p>
        <h1 className={amount ? undefined : "is-pending"}>{amount ?? "확인 중"}</h1>
        {amount ? <span>USDC</span> : null}
        {!authenticated && <small>로그인하면 자산이 보여요</small>}
      </section>

      <nav className="home-actions" aria-label="빠른 실행">
        {actions.map((action) => (
          <Link key={action.href} href={action.href}>
            <span className="home-action-icon">
              <ActionIcon name={action.icon} />
            </span>
            {action.label}
          </Link>
        ))}
      </nav>

      <section className="home-holdings">
        <h2>자산</h2>
        <Link href="/product/assets" className="home-holding">
          <Image src="/figma/usdc-logo.svg" alt="" width={40} height={40} />
          <span>
            <strong>USDC</strong>
            <small>스테이블코인</small>
          </span>
          <b>{amount ?? "확인 중"}</b>
        </Link>
      </section>

      {authenticated && failed && (
        <p className="wallet-alert" role="alert">
          일부 메인넷 잔액을 확인하지 못했어요.
        </p>
      )}
    </main>
  );
}
