"use client";

import { useExportWallet, usePrivy, type User } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { usePaymentPin } from "@/features/payment-pin/PaymentPinProvider";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";

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
  if (latest?.type === "google_oauth") return <span>{latest.email}</span>;
  if (latest?.type === "email") return <span>{latest.address}</span>;
  if (user.google?.email) return <span>{user.google.email}</span>;
  if (user.email?.address) return <span>{user.email.address}</span>;
  return <span>확인 불가</span>;
}

export default function ProductWalletPage() {
  const { user, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { embeddedWallet } = useDepositAccounts();
  const paymentPin = usePaymentPin();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const shell = exportOpen && typeof document !== "undefined"
    ? document.querySelector<HTMLElement>(".wallet-shell")
    : null;
  const exportDialog = (
    <div className="wallet-modal-backdrop move-backdrop" role="presentation" onClick={() => setExportOpen(false)}>
      <div
        className="wallet-modal move-modal wallet-export-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-key-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="export-key-title">지갑 열쇠를 내보낼까요?</h2>
        <div className="wallet-warning wallet-note">
          <span>
            <strong>열쇠를 아는 사람은 누구나 자산을 옮길 수 있어요.</strong>
            <br />
            화면을 캡처하거나 다른 사람에게 보내지 마세요. EasyDeFi는 절대 열쇠를 물어보지 않아요.
          </span>
        </div>
        <div className="move-actions">
          <button type="button" className="move-pill" onClick={() => void onExport()}>
            내보내기
          </button>
          <button type="button" className="move-pill move-pill-quiet" onClick={() => setExportOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <main className="wallet-page wallet-settings">
      <div className="wallet-settings-title">
        <Link href="/product" className="wallet-back" aria-label="뒤로">
          <Image src="/figma/wallet-back.svg" alt="" width={24} height={24} />
        </Link>
        <h1>내 지갑</h1>
      </div>

      <section className="wallet-settings-list">
        <h2>계정</h2>
        <div className="wallet-settings-row">
          <span>로그인 계정</span>
          <span className="wallet-settings-value">{user ? loginAccount(user) : "확인 중"}</span>
        </div>
        <Link href="/product/wallet/account" className="wallet-settings-row">
          <span>내 지갑 주소</span>
          <span className="wallet-settings-value">›</span>
        </Link>

        <h2>보안</h2>
        <Link href="/product/wallet/payment-pin" className="wallet-settings-row">
          <span>결제 비밀번호</span>
          <span className="wallet-settings-value">
            {paymentPin.enabled === null ? "확인 중" : paymentPin.enabled ? "사용 중 ›" : "꺼짐 ›"}
          </span>
        </Link>
        <button
          type="button"
          className="wallet-settings-row"
          onClick={() => {
            setExportError(null);
            setExportOpen(true);
          }}
        >
          <span>지갑 열쇠 내보내기</span>
          <span className="wallet-settings-value">›</span>
        </button>
        {exportError && (
          <p className="wallet-alert" role="alert">
            {exportError}
          </p>
        )}

        <h2>약관 · 정책</h2>
        <Link href="/product/wallet/legal/terms" className="wallet-settings-row">
          <span>이용약관</span>
          <span className="wallet-settings-value">v1.2 ›</span>
        </Link>
        <Link href="/product/wallet/legal/privacy" className="wallet-settings-row">
          <span>개인정보 처리방침</span>
          <span className="wallet-settings-value">v1.2 ›</span>
        </Link>
        <Link href="/product/wallet/legal/risk" className="wallet-settings-row">
          <span>위험 고지</span>
          <span className="wallet-settings-value">›</span>
        </Link>

        <h2>도움</h2>
        <Link href="/product/wallet/help" className="wallet-settings-row">
          <span>도움말</span>
          <span className="wallet-settings-value">›</span>
        </Link>
        <button type="button" className="wallet-settings-row is-danger" onClick={() => void logout()}>
          <span>로그아웃</span>
        </button>
      </section>

      <p className="wallet-settings-footnote">이용약관 v1.2 · 앱 버전 0.1</p>
      {shell ? createPortal(exportDialog, shell) : null}
    </main>
  );
}
