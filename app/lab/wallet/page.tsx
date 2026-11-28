"use client";

import { useExportWallet, usePrivy, type User } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePaymentPin } from "@/features/payment-pin/PaymentPinProvider";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";

const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1.5rem",
  borderBottom: "1px solid #888",
  padding: "0.85rem 0",
};
const section = { border: "1px solid #888", padding: "0 1rem", marginTop: "1rem" };
const buttonRow = {
  ...row,
  width: "100%",
  background: "none",
  borderLeft: "none",
  borderRight: "none",
  borderTop: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  textAlign: "left" as const,
};

function loginAccount(user: User) {
  const candidates = user.linkedAccounts.filter((account) => {
    if (account.type === "email" || account.type === "google_oauth") return true;
    return account.type === "wallet" && account.chainType === "ethereum" && account.walletClientType !== "privy";
  });
  const latest = candidates.reduce<(typeof candidates)[number] | undefined>((current, account) => {
    if (!current) return account;
    const currentTime = current.latestVerifiedAt?.getTime() ?? 0;
    const accountTime = account.latestVerifiedAt?.getTime() ?? 0;
    return accountTime >= currentTime ? account : current;
  }, undefined);

  if (latest?.type === "wallet" && latest.walletClientType === "metamask") {
    return <Image src="/wallet/metamask-temp.svg" alt="MetaMask" width={20} height={20} />;
  }
  if (latest?.type === "google_oauth") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <Image src="/wallet/google-temp.svg" alt="" width={20} height={20} />
        {latest.email}
      </span>
    );
  }
  if (latest?.type === "email") return <span>{latest.address}</span>;
  if (user.google?.email) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <Image src="/wallet/google-temp.svg" alt="" width={20} height={20} />
        {user.google.email}
      </span>
    );
  }
  if (user.email?.address) return <span>{user.email.address}</span>;
  return <span>확인 불가</span>;
}

export default function WalletPage() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { embeddedWallet } = useDepositAccounts();
  const paymentPin = usePaymentPin();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!ready) return <p>확인 중</p>;
  if (!authenticated || !user) {
    return (
      <main style={page}>
        <button type="button" onClick={login}>Login</button>
      </main>
    );
  }

  async function onExport() {
    setExportOpen(false);
    if (!embeddedWallet) {
      setExportError("내보낼 임베디드 지갑이 없습니다.");
      return;
    }
    try {
      await exportWallet({ address: embeddedWallet.address });
      setExportError(null);
    } catch (cause) {
      console.error(cause);
      setExportError("열쇠를 내보내지 못했습니다.");
    }
  }

  return (
    <main style={page}>
      <p><Link href="/lab">Lab</Link></p>
      <h1>내 지갑</h1>

      <section style={section}>
        <h2>계정</h2>
        <Link href="/lab/wallet/account" style={{ ...row, color: "inherit", textDecoration: "none" }}>
          <span>지갑주소</span>
          <span>›</span>
        </Link>
        <div style={row}>
          <span>로그인 계정</span>
          <span>{loginAccount(user)}</span>
        </div>
      </section>

      <section style={section}>
        <h2>보안</h2>
        <button type="button" onClick={paymentPin.openSettings} style={buttonRow}>
          <span>결제 비밀번호</span>
          <span>
            {paymentPin.configured === null ? "확인 중" : paymentPin.configured ? "설정됨 ›" : "설정 안 됨 ›"}
          </span>
        </button>
        <button type="button" onClick={() => { setExportError(null); setExportOpen(true); }} style={buttonRow}>
          <span>지갑 열쇠 내보내기</span>
          <span>›</span>
        </button>
        {exportError && <p>{exportError}</p>}
      </section>

      <section style={section}>
        <h2>약관/정책</h2>
        <div style={row}><span>이용약관</span><span>›</span></div>
        <div style={row}><span>개인정보처리방침</span><span>›</span></div>
        <div style={row}><span>위험 고지</span><span>›</span></div>
      </section>

      <section style={section}>
        <h2>도움</h2>
        <div style={row}><span>도움말</span><span>›</span></div>
        <button type="button" onClick={() => void logout()} style={buttonRow}>로그아웃</button>
      </section>

      {exportOpen && (
        <div
          role="presentation"
          onClick={() => setExportOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-key-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(28rem, 100%)", background: "#111", color: "#fff", border: "1px solid #888", padding: "1.25rem" }}
          >
            <h2 id="export-key-title" style={{ marginTop: 0 }}>지갑 열쇠 내보내기</h2>
            <p>열쇠는 지갑을 제어하는 키이고, 메타마스크에 넣으면 다른 주소가 보이며 여기 잔액은 나오지 않는다</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" onClick={() => setExportOpen(false)}>취소</button>
              <button type="button" onClick={() => void onExport()}>내보내기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
