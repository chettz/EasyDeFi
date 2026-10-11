import Image from "next/image";
import { formatEther, formatUnits, type Address } from "viem";
import type { Erc20PaymasterCall, Erc20PaymasterFeePreview } from "../lib/parse-erc20-paymaster-fee";

export type PendingSend = {
  kind: "native" | "usdc" | "data";
  summary: string;
  call: Erc20PaymasterCall;
  preview: Erc20PaymasterFeePreview | null;
  error: string | null;
  usdc?: {
    recipient: Address;
    amount: bigint;
  };
};

export type CompletedUsdcSend = {
  recipient: Address;
  amount: bigint;
  gas: bigint | null;
  token?: string;
};

export function formatUsdcAmount(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  return `${whole}.${fraction.padEnd(6, "0").slice(0, 6)}`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
    
export function TransactionModal({
  pending,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  pending: PendingSend;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          color: "#111",
          padding: "1rem",
          border: "1px solid #444",
        }}
      >
        <h2 id="transaction-modal-title" style={{ marginTop: 0 }}>
          {pending.kind === "usdc" ? "USDC 전송" : "Confirm transaction"}
        </h2>
        {pending.kind === "usdc" && pending.usdc ? (
          <UsdcConfirmDetails pending={pending} /> // USDC 전송 확인 상세 내용 표시
        ) : (
          <>
            <p>{pending.summary}</p>
            <p>To: {pending.call.to}</p>
            {pending.call.value !== undefined && <p>Value: {formatEther(pending.call.value)} ETH</p>}
            {pending.call.data !== undefined && (
              <p style={{ overflowWrap: "anywhere" }}>Data: {pending.call.data}</p>
            )}
            {/* 오류가 있으면 수수료 대신 오류를 보여 준다. 없으면 계산된 최대 수수료, 아직이면 "계산 중" */}
            {pending.error ? (
              <p role="alert">{pending.error}</p>
            ) : (
              <p>
                {pending.preview
                  ? `Estimated maximum fee: ${pending.preview.humanReadableCostInToken} USDC ($${pending.preview.humanReadableUsdAmount})`
                  : "Estimating maximum fee..."}
              </p>
            )}
            <p>The amount actually charged can be lower than this maximum quote.</p>
          </>
        )}
        {/* 수수료가 있고, 오류가 없고, 전송 중이 아닐 때만 Confirm을 누를 수 있다. */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={!pending.preview || pending.error !== null || isSubmitting}
          style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
        >
          {pending.kind === "usdc" ? "전송" : "Confirm send"}
        </button>
        {/* 수수료 계산 중에는 닫을 수 있다. 전송이 시작된 뒤에만 Cancel을 막는다. */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting && pending.preview !== null}
          style={{ border: "1px solid #444", padding: "0.5rem 0.75rem", marginLeft: "0.5rem" }}
        >
          {pending.kind === "usdc" ? "취소" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

// USDC 전송 확인 상세 내용 표시 팝업
function UsdcConfirmDetails({ pending }: { pending: PendingSend }) {
  const usdc = pending.usdc;
  if (!usdc) return null;

  return (
    <>
      <p>{formatUsdcAmount(usdc.amount)} USDC를 전송합니다.</p>
      <p>- 받는 주소: {shortAddress(usdc.recipient)}</p>
      {pending.error ? (
        <p role="alert">{pending.error}</p>
      ) : (
        <p>
          {pending.preview ? (
            <>
              - 예상 최대 가스비: 약 {formatUsdcAmount(pending.preview.costInToken)} USDC
              <br />
              (실제 가스비는 이보다 적을 수 있습니다.)
            </>
          ) : (
            "예상 최대 가스비를 계산하고 있습니다."
          )}
        </p>
      )}
      <p>- 가스비 결제를 위해 paymaster에게 USDC 사용 권한을 부여합니다.</p>
    </>
  );
}

// usdc 전송 중 팝업
export function UsdcSendingModal() {
  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="usdc-sending-title"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          color: "#111",
          padding: "1rem",
          border: "1px solid #444",
        }}
      >
        <h2 id="usdc-sending-title" style={{ marginTop: 0 }}>
          전송 중
        </h2>
        <p>USDC 전송을 처리하고 있습니다.</p>
      </div>
    </div>
  );
}

// usdc 전송 완료 팝업
export function UsdcCompleteModal({
  completed,
  onClose,
}: {
  completed: CompletedUsdcSend;
  onClose: () => void;
}) {
  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="usdc-complete-title"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          color: "#111",
          padding: "1rem",
          border: "1px solid #444",
        }}
      >
        <h2 id="usdc-complete-title" style={{ marginTop: 0 }}>
          전송 완료
        </h2>
        <p>- 보낸 금액: {formatUsdcAmount(completed.amount)} {completed.token ?? "USDC"}</p>
        <p>- 받는 사람: {shortAddress(completed.recipient)}</p>
        <p>
          - 실제 가스비:{" "}
          {completed.gas === null
            ? "확인하지 못했습니다."
            : `${formatUsdcAmount(completed.gas)} ${completed.token ?? "USDC"}`}
        </p>
        {completed.gas !== null && (
          <p>- 총 차감: {formatUsdcAmount(completed.amount + completed.gas)} {completed.token ?? "USDC"}</p>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

export type PendingWithdraw = {
  token: string;
  network: string;
  to: string;
  amount: string;
  fee: string;
};

export function WithdrawConfirmModal({
  pending,
  isSending,
  onConfirm,
  onCancel,
}: {
  pending: PendingWithdraw;
  isSending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="wallet-modal-backdrop" role="presentation">
      <div
        className="wallet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-confirm-title"
      >
        <h2 id="withdraw-confirm-title">
          {isSending ? `${pending.token}를 보내고 있어요` : "출금 전에 확인해 주세요"}
        </h2>
        <dl className="wallet-detail-list">
          <div className="wallet-detail-row">
            <dt>출금하는 수량</dt>
            <dd>{pending.amount} {pending.token}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>출금 주소</dt>
            <dd>{shortAddress(pending.to)}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>출금 네트워크</dt>
            <dd>{pending.network}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>수수료</dt>
            <dd>{pending.fee}</dd>
          </div>
        </dl>
        {isSending ? (
          <div className="wallet-sending" role="status">
            <Image src="/figma/loading.svg" alt="" width={22} height={22} />
            <span>보통 몇 초에서 수십 초 걸려요</span>
          </div>
        ) : (
          <>
            <div className="wallet-warning">
              <span>
                받는 주소와 네트워크가 맞는지 확인해 주세요.
                <br />
                <strong>확인을 누르면 되돌릴 수 없어요.</strong>
              </span>
            </div>
            <div className="wallet-actions">
              <button type="button" onClick={onConfirm} className="wallet-primary-button">
                {pending.amount} {pending.token} 출금
              </button>
              <button type="button" onClick={onCancel} className="wallet-secondary-button">
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
