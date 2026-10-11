"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import BottomTabBar from "./BottomTabBar";

export default function WalletShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated, login } = usePrivy();
  const isProductHome = pathname === "/product";

  return (
    <div className="wallet-shell">
      <header className="wallet-header">
        <strong>EasyDeFi</strong>
        {authenticated ? (
          <span className="wallet-pill">내 지갑</span>
        ) : (
          <button type="button" className="wallet-pill" onClick={login} disabled={!ready}>
            로그인
          </button>
        )}
      </header>
      <div className="wallet-content">
        {!ready ? (
          <p className="wallet-centered-status" role="status">
            지갑을 준비하고 있어요.
          </p>
        ) : !authenticated && !isProductHome ? (
          <div className="wallet-login">
            <h1>지갑 연결이 필요해요</h1>
            <p>입금 주소와 잔액을 확인하려면 먼저 로그인해 주세요.</p>
            <button type="button" className="wallet-primary-button" onClick={login}>
              로그인
            </button>
          </div>
        ) : (
          children
        )}
      </div>
      <BottomTabBar />
    </div>
  );
}
