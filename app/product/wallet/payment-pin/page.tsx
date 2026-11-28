"use client";

import { PaymentPinLocked, usePaymentPin } from "@/features/payment-pin/PaymentPinProvider";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function PaymentPinSettingsPage() {
  const paymentPin = usePaymentPin();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const on = paymentPin.enabled === true;
  const locked = paymentPin.locked;

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showRecoveryToast() {
    setToast(true);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(false);
    }, 2000);
  }

  async function onToggle() {
    if (locked) {
      showRecoveryToast();
      return;
    }
    if (paymentPin.enabled === null || busy) return;
    setError(null);
    if (!paymentPin.configured) {
      paymentPin.openSettings();
      return;
    }
    setBusy(true);
    try {
      await paymentPin.updateEnabled(!paymentPin.enabled);
    } catch (cause) {
      if (cause instanceof PaymentPinLocked) {
        showRecoveryToast();
        return;
      }
      console.error(cause);
      setError("비밀번호 설정을 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const shell = toast && typeof document !== "undefined" ? document.querySelector(".wallet-shell") : null;

  return (
    <main className="wallet-page wallet-settings pin-settings">
      <div className="wallet-settings-title">
        <Link href="/product/wallet" className="wallet-back" aria-label="뒤로">
          <Image src="/figma/wallet-back.svg" alt="" width={24} height={24} />
        </Link>
        <h1>간편 결제 비밀번호</h1>
      </div>
      <div className="pin-setting">
        <div>
          <strong>비밀번호 사용</strong>
          <p>끄면 출금과 예치 전에 번호를 묻지 않아요.</p>
        </div>
        <button
          type="button"
          className={`pin-switch${on ? " is-on" : ""}${locked ? " is-locked" : ""}`}
          role="switch"
          aria-checked={on}
          aria-disabled={locked}
          aria-label="비밀번호 사용"
          disabled={!locked && (paymentPin.enabled === null || busy)}
          onClick={() => void onToggle()}
        >
          <span />
        </button>
      </div>
      <button type="button" className="wallet-settings-row" disabled={!paymentPin.configured} onClick={paymentPin.openSettings}>
        <span>비밀번호 변경</span>
        <span className="wallet-settings-value">›</span>
      </button>
      {error ? (
        <p className="wallet-alert" role="alert">
          {error}
        </p>
      ) : null}
      {toast && shell
        ? createPortal(
            <p className="wallet-copy-toast" role="status">
              결제 비밀번호 복구 필요
            </p>,
            shell,
          )
        : null}
    </main>
  );
}
