"use client";

import Image from "next/image";
import { formatUnits, type Address } from "viem";
import { depositNetworkLabel } from "@/lib/deposit/networks";

export type CompletedWithdraw = {
  recipient: Address;
  token: string;
  network: string;
  amount: bigint;
  gas: bigint | null;
  completedAt: Date;
};

function completedAtText(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function WithdrawSuccess({
  completed,
  onClose,
}: {
  completed: CompletedWithdraw;
  onClose: () => void;
}) {
  return (
    <main className="wallet-page wallet-result move-page">
      <Image
        className="wallet-result-icon"
        src="/figma/move-success.svg"
        alt=""
        width={64}
        height={64}
      />
      <h1>출금 완료</h1>
      <dl className="wallet-detail-list wallet-result-details">
        <div className="wallet-detail-row">
          <dt>거래 일시</dt>
          <dd>{completedAtText(completed.completedAt)}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>거래 유형</dt>
          <dd>{completed.token} 출금</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>출금 네트워크</dt>
          <dd>{depositNetworkLabel(completed.network)}</dd>
        </div>
        <div className="wallet-detail-row move-amount-row">
          <dt>출금 수량</dt>
          <dd>{formatUnits(completed.amount, 6)} {completed.token}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>수수료</dt>
          <dd>
            {completed.gas === null
              ? "확인하지 못했어요"
              : `${formatUnits(completed.gas, 6)} ${completed.token}`}
          </dd>
        </div>
      </dl>
      <div className="wallet-result-spacer" />
      <button type="button" className="move-pill" onClick={onClose}>
        확인
      </button>
    </main>
  );
}

export function WithdrawFailure({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <main className="wallet-page wallet-result move-page">
      <Image
        className="wallet-result-icon"
        src="/figma/move-failure.svg"
        alt=""
        width={64}
        height={64}
      />
      <h1>출금 실패</h1>
      <div className="move-failure-copy">
        <strong>출금을 완료하지 못했어요.</strong>
        <p>
          자산은 지갑에 그대로 있어요. {message}
        </p>
      </div>
      <div className="wallet-result-spacer" />
      <div className="move-actions">
        <button type="button" className="move-pill" onClick={onRetry}>
          다시 시도
        </button>
        <button type="button" className="move-pill move-pill-quiet" onClick={onClose}>
          닫기
        </button>
      </div>
    </main>
  );
}
