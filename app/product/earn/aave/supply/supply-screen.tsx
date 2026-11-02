"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FEE_USDC_SHORT_MESSAGE, useSupplyBaseUsdc } from "@/features/aave/use-supply-base-usdc";

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

function apyLabel(apy: string) {
  return apy.endsWith("%") ? `연 ${apy} · 변동` : apy;
}

export function AaveSupplyScreen({ supplyApy, referenceTime }: { supplyApy: string; referenceTime: string }) {
  const supply = useSupplyBaseUsdc(supplyApy);
  const balanceIsAmount = /^\d+(\.\d+)?$/.test(supply.balanceText);
  const pending = supply.pendingSupply;
  const feeReady = pending !== null && pending.fee !== "계산 전" && pending.fee !== "계산 중" && pending.fee !== "수수료를 계산하지 못했습니다.";
  const shell = pending && typeof document !== "undefined" ? document.querySelector<HTMLElement>(".wallet-shell") : null;

  if (supply.success) {
    const received = supply.success.receivedAmount
      ? `${formatUsdc(supply.success.receivedAmount)} ${supply.success.receivedSymbol ?? "aBasUSDC"}`
      : "확인하지 못했어요";
    return (
      <ResultScreen
        icon="/figma/success.svg"
        title="USDC 넣기 완료"
        rows={[
          ["거래 일시", formatTradeTime(supply.success.at)],
          ["거래 유형", "USDC 넣기"],
          ["넣은 수량", `${formatUsdc(supply.success.amount)} USDC`],
          ["수수료", supply.success.fee.replace(/^약\s/, "")],
          ["받은 예치 토큰 수량", received],
        ]}
        action={<Link href="/product/earn/aave" className="earn-detail-submit">확인</Link>}
      />
    );
  }

  if (supply.failure) {
    return (
      <ResultScreen
        icon="/figma/failure.svg"
        title="USDC 넣기 실패"
        message="USDC 넣기를 완료하지 못했어요."
        detail={supply.failure.message}
        code={supply.failure.code}
        action={
          <div className="earn-supply-result-actions">
            <button type="button" className="earn-detail-submit" onClick={supply.resetOutcome}>
              다시 시도
            </button>
            <Link href="/product/earn/aave" className="earn-detail-withdraw">
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
          <div className="earn-supply-popup" role="dialog" aria-modal="true" aria-labelledby="supply-confirm-title">
            <h2 id="supply-confirm-title">{supply.isSupplying ? "USDC를 넣고 있어요" : "넣기 전에 확인해 주세요"}</h2>
            <dl>
              <div>
                <dt>예치 상품</dt>
                <dd>{supply.isSupplying ? "Aave USDC 예치" : "Aave Base USDC"}</dd>
              </div>
              <div>
                <dt>넣는 수량</dt>
                <dd>{formatUsdc(pending.amount)} USDC</dd>
              </div>
              <div>
                <dt>{supply.isSupplying ? "예상 수익률" : "공급 연수익률(Supply APY)"}</dt>
                <dd>{apyLabel(pending.apy)}</dd>
              </div>
              <div>
                <dt>{supply.isSupplying ? "수수료" : "예상 수수료"}</dt>
                <dd>{feeLabel(pending.fee)}</dd>
              </div>
            </dl>
            {supply.isSupplying ? (
              <div className="earn-supply-waiting" role="status">
                <Image src="/figma/supply-loading.svg" alt="" width={22} height={22} />
                <span>보통 몇 초에서 수십 초 걸려요</span>
              </div>
            ) : (
              <div className="earn-supply-popup-actions">
                <button
                  type="button"
                  className="earn-supply-confirm"
                  onClick={() => void supply.onConfirmSupply()}
                  disabled={!feeReady || supply.feeOverBalance}
                >
                  확인
                </button>
                <button type="button" className="earn-supply-cancel" onClick={supply.cancelSupply}>
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
        <button type="button" role="tab" aria-selected="true">
          넣기
        </button>
        <Link href="/product/earn/aave/withdraw" role="tab" aria-selected="false">
          꺼내기
        </Link>
      </div>
      <form className="earn-supply-form" onSubmit={(event) => void supply.onSupply(event)}>
        <section className="earn-supply-card">
          <p>수량</p>
          <div className="earn-supply-amount">
            <input
              value={supply.supplyAmount}
              onChange={(event) => supply.setSupplyAmount(event.target.value)}
              inputMode="decimal"
              aria-label="넣는 수량"
              placeholder="0.00"
            />
            <span className="earn-supply-unit">
              <Image src="/figma/usdc-logo.svg" alt="" width={24} height={24} />
              USDC
            </span>
          </div>
          <div className="earn-supply-balance">
            <span>현재 잔액: {balanceIsAmount ? `${formatUsdc(supply.balanceText)} USDC` : supply.balanceText}</span>
            <button type="button" onClick={() => void supply.onMaxAmount()} disabled={supply.maxDisabled}>
              {supply.isMaxQuoting ? "계산 중" : "최대"}
            </button>
          </div>
        </section>
        <section className="earn-supply-card earn-supply-apy">
          <p>공급 연수익률(Supply APY)</p>
          <strong>{supplyApy.endsWith("%") ? `연 ${supplyApy}` : supplyApy}</strong>
          <span>{referenceTime}</span>
        </section>
        {supply.feeOverBalance && <p className="wallet-alert" role="alert">{FEE_USDC_SHORT_MESSAGE}</p>}
        {supply.supplyMessage && !supply.failure && !supply.success && <p className="wallet-alert">{supply.supplyMessage}</p>}
        <button type="submit" className="earn-detail-submit" disabled={supply.isSupplying}>
          USDC 넣기
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
