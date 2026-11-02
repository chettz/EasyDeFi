"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWithdrawBaseUsdc } from "@/features/aave/use-withdraw-base-usdc";

function formatUsdc(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  const digits = fraction.replace(/0+$/, "");
  return `${Number(whole).toLocaleString("ko-KR")}${digits ? `.${digits}` : ""}`;
}

function formatTradeTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
}

function feeLabel(fee: string) {
  return /^\d/.test(fee) ? `약 ${fee}` : fee;
}

export function AaveWithdrawScreen() {
  const withdraw = useWithdrawBaseUsdc();
  const balanceIsAmount = /^\d+(\.\d+)?$/.test(withdraw.withdrawableText);
  const pending = withdraw.pendingWithdraw;
  const feeReady = pending !== null && pending.fee !== "계산 전" && pending.fee !== "계산 중" && pending.fee !== "수수료를 계산하지 못했습니다.";
  const shell = pending && typeof document !== "undefined" ? document.querySelector<HTMLElement>(".wallet-shell") : null;
  const availableLabel = balanceIsAmount ? `${formatUsdc(withdraw.withdrawableText)} USDC` : withdraw.withdrawableText;

  if (withdraw.success) {
    return (
      <ResultScreen
        icon="/figma/withdraw-success.svg"
        title="USDC 꺼내기 완료"
        rows={[
          ["거래 일시", formatTradeTime(withdraw.success.at)],
          ["거래 유형", "USDC 꺼내기"],
          ["꺼낸 수량", `${formatUsdc(withdraw.success.amount)} USDC`],
          ["꺼내고 남은 수량", `${formatUsdc(withdraw.success.remaining)} USDC`],
          ["수수료", withdraw.success.fee.replace(/^약\s/, "")],
        ]}
        action={<Link href="/product/earn/aave" className="earn-result-dark">확인</Link>}
      />
    );
  }

  if (withdraw.failure) {
    return (
      <ResultScreen
        icon="/figma/withdraw-failure.svg"
        title="USDC 꺼내기 실패"
        message="USDC 꺼내기를 완료하지 못했어요."
        detail={withdraw.failure.message}
        code={withdraw.failure.code}
        action={
          <div className="earn-supply-result-actions">
            <button type="button" className="earn-result-dark" onClick={withdraw.resetOutcome}>
              다시 시도
            </button>
            <Link href="/product/earn/aave" className="earn-result-ghost">
              닫기
            </Link>
          </div>
        }
      />
    );
  }

  const overlay = pending && shell
    ? createPortal(
        <div className="earn-supply-backdrop" role="presentation">
          <div className="earn-supply-popup" role="dialog" aria-modal="true" aria-labelledby="withdraw-confirm-title">
            <h2 id="withdraw-confirm-title">{withdraw.isWithdrawing ? "USDC를 꺼내고 있어요" : "꺼내기 전에 확인해 주세요"}</h2>
            <dl>
              <div>
                <dt>예치 상품</dt>
                <dd>Aave Base USDC</dd>
              </div>
              <div>
                <dt>꺼내는 수량</dt>
                <dd>{formatUsdc(pending.amount)} USDC</dd>
              </div>
              <div>
                <dt>{withdraw.isWithdrawing ? "수수료" : "예상 수수료"}</dt>
                <dd>{feeLabel(pending.fee)}</dd>
              </div>
            </dl>
            {withdraw.isWithdrawing ? (
              <div className="earn-supply-waiting" role="status">
                <Image src="/figma/supply-loading.svg" alt="" width={22} height={22} />
                <span>보통 몇 초에서 수십 초 걸려요</span>
              </div>
            ) : (
              <div className="earn-supply-popup-actions">
                <button
                  type="button"
                  className="earn-supply-confirm"
                  onClick={() => void withdraw.onConfirmWithdraw()}
                  disabled={!feeReady}
                >
                  확인
                </button>
                <button type="button" className="earn-supply-cancel" onClick={withdraw.cancelWithdraw}>
                  취소
                </button>
              </div>
            )}
          </div>
        </div>,
        shell,
      )
    : null;

  return (
    <main className="wallet-page earn-supply">
      <Link href="/product/earn/aave" className="earn-detail-title" aria-label="상품 상세로 돌아가기">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18 9 12 15 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Aave Base USDC
      </Link>
      <div className="earn-supply-switch" role="tablist" aria-label="넣기 또는 꺼내기">
        <Link href="/product/earn/aave/supply" role="tab" aria-selected="false">
          넣기
        </Link>
        <button type="button" role="tab" aria-selected="true">
          꺼내기
        </button>
      </div>
      <form className="earn-supply-form" onSubmit={(event) => void withdraw.onWithdraw(event)}>
        <section className="earn-supply-card">
          <p>수량</p>
          <div className="earn-supply-amount">
            <input
              value={withdraw.withdrawAmount}
              onChange={(event) => withdraw.setWithdrawAmount(event.target.value)}
              inputMode="decimal"
              aria-label="꺼내는 수량"
              placeholder="0.00"
            />
            <span className="earn-supply-unit">
              <Image src="/figma/usdc-logo.svg" alt="" width={24} height={24} />
              USDC
            </span>
          </div>
          <div className="earn-supply-balance">
            <span>꺼낼 수 있는 수량: {availableLabel}</span>
            <button type="button" onClick={withdraw.onMaxAmount} disabled={withdraw.maxDisabled}>
              최대
            </button>
          </div>
        </section>
        {withdraw.isAmountTooLarge && <p className="wallet-alert" role="alert">꺼낼 수 있는 수량을 넘었어요.</p>}
        {withdraw.withdrawMessage && !withdraw.failure && !withdraw.success && <p className="wallet-alert">{withdraw.withdrawMessage}</p>}
        <button type="submit" className="earn-detail-submit" disabled={withdraw.isWithdrawing}>
          USDC 꺼내기
        </button>
      </form>
      {overlay}
    </main>
  );
}

function ResultScreen({
  icon,
  title,
  rows,
  message,
  detail,
  code,
  action,
}: {
  icon: string;
  title: string;
  rows?: [string, string][];
  message?: string;
  detail?: string;
  code?: string | null;
  action: ReactNode;
}) {
  return (
    <main className="wallet-page earn-supply-result">
      <div className="earn-supply-result-body">
        <Image src={icon} alt="" width={64} height={64} />
        <h1>{title}</h1>
        {message && (
          <div className="earn-supply-failure-copy">
            <p>{message}</p>
            {detail && <p>{detail}</p>}
            {code && <p>오류 코드 {code}</p>}
          </div>
        )}
        {rows && (
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {action}
    </main>
  );
}
