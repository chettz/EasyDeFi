"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LoginFlow from "@/features/auth/LoginFlow";
import BottomTabBar from "./BottomTabBar";

const LOGIN_INTENT_KEY = "easydefi.login-intent";
type LoginIntent = "login" | "create";

function storedIntent(): LoginIntent | null {
  try {
    const value = sessionStorage.getItem(LOGIN_INTENT_KEY);
    return value === "login" || value === "create" ? value : null;
  } catch {
    return null;
  }
}

function storeIntent(intent: LoginIntent | null) {
  try {
    if (intent) sessionStorage.setItem(LOGIN_INTENT_KEY, intent);
    else sessionStorage.removeItem(LOGIN_INTENT_KEY);
  } catch {
    // The flow still continues when storage is unavailable.
  }
}

export default function WalletShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated } = usePrivy();
  const [loginOpen, setLoginOpen] = useState(false);
  const [intent, setIntent] = useState<LoginIntent | null>(null);
  const isProductHome = pathname === "/product";
  const showFlow = ready && loginOpen && (!authenticated || intent === "create");

  useEffect(() => {
    if (!ready || !authenticated) return;
    const pending = storedIntent();
    if (pending === "create" || intent === "create") {
      if (intent !== "create") setIntent("create");
      setLoginOpen(true);
      return;
    }
    setLoginOpen(false);
  }, [authenticated, intent, ready]);

  function openChooser() {
    storeIntent(null);
    setIntent(null);
    setLoginOpen(true);
  }

  function openIntent(next: LoginIntent) {
    storeIntent(next);
    setIntent(next);
    setLoginOpen(true);
  }

  function closeIntent() {
    storeIntent(null);
    setIntent(null);
    setLoginOpen(false);
  }

  return (
    <div className="wallet-shell">
      <header className="wallet-header">
        <strong>EasyDeFi</strong>
        {authenticated ? (
          <Link href="/product/wallet" className="wallet-pill wallet-settings" aria-label="내 지갑">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.5a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.18a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </Link>
        ) : (
          <button type="button" className="wallet-pill" onClick={openChooser} disabled={!ready}>
            로그인
          </button>
        )}
      </header>
      <div className="wallet-content">
        {!ready ? (
          <p className="wallet-centered-status" role="status">
            지갑을 준비하고 있어요.
          </p>
        ) : showFlow ? (
          <LoginFlow intent={intent} onClose={closeIntent} onChoose={openIntent} />
        ) : !authenticated && !isProductHome ? (
          <div className="wallet-login login-gate">
            <h1>지갑 연결이 필요해요</h1>
            <p>이미 있으면 로그인하고, 처음이면 지갑을 만들어요.</p>
            <button type="button" className="login-primary" onClick={() => openIntent("login")}>
              로그인
            </button>
            <button type="button" className="login-choice" onClick={() => openIntent("create")}>
              지갑 생성
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
