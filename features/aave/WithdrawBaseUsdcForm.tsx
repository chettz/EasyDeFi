"use client";

import { WithdrawConfirmModal } from "@/components/TransactionModal";
import { useWithdrawBaseUsdc } from "@/features/aave/use-withdraw-base-usdc";

const fieldStyle = { border: "1px solid #888", padding: "0.5rem", marginTop: "0.25rem", width: "16rem" };
const buttonStyle = { border: "1px solid #444", padding: "0.5rem 0.75rem", background: "#fff", cursor: "pointer" };
const PRODUCT_NAME = "Aave USDC 풀(Base)";

export function WithdrawBaseUsdcForm() {
  const withdraw = useWithdrawBaseUsdc();

  return (
    <div>
      {withdraw.ready && !withdraw.authenticated && (
        <p>
          <button type="button" onClick={withdraw.login} style={buttonStyle}>
            Login
          </button>
        </p>
      )}
      <p>꺼낼 수 있는 수량: {withdraw.withdrawableText} USDC</p>
      <form onSubmit={(event) => void withdraw.onWithdraw(event)} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          value={withdraw.withdrawAmount}
          onChange={(event) => withdraw.setWithdrawAmount(event.target.value)}
          inputMode="decimal"
          aria-label="Withdraw 수량"
          style={fieldStyle}
        />
        <button type="button" onClick={withdraw.onMaxAmount} disabled={withdraw.maxDisabled} style={buttonStyle}>
          최대
        </button>
        <button type="submit" disabled={withdraw.isWithdrawing} style={buttonStyle}>
          Withdraw
        </button>
      </form>
      {withdraw.isAmountTooLarge && <p role="alert">꺼낼 수 있는 수량을 넘었어요.</p>}
      {withdraw.withdrawMessage && <p>{withdraw.withdrawMessage}</p>}
      {withdraw.receivedUsdc && <p>{withdraw.receivedUsdc} USDC</p>}
      {withdraw.pendingWithdraw && (
        <WithdrawConfirmModal
          pending={{
            token: "USDC",
            network: "Base",
            to: withdraw.depositAddress ?? "0x0000000000000000000000000000000000000000",
            amount: withdraw.pendingWithdraw.amount,
            fee: withdraw.pendingWithdraw.fee,
          }}
          isSending={withdraw.isWithdrawing}
          onConfirm={() => void withdraw.onConfirmWithdraw()}
          onCancel={withdraw.cancelWithdraw}
          title="꺼내기 전에 확인해주세요"
          sendingTitle="USDC를 꺼내고 있어요"
          rows={[
            { label: "예치 상품", value: PRODUCT_NAME },
            { label: "꺼내는 수량", value: `${withdraw.pendingWithdraw.amount} USDC` },
            { label: "꺼내고 남는 수량", value: `${withdraw.pendingWithdraw.remaining} USDC` },
            { label: "수수료", value: withdraw.pendingWithdraw.fee },
          ]}
          confirmLabel="꺼내기"
          cancelLabel="취소"
          warning={null}
          confirmDisabled={
            withdraw.pendingWithdraw.fee === "계산 전" ||
            withdraw.pendingWithdraw.fee === "계산 중" ||
            withdraw.pendingWithdraw.fee === "수수료를 계산하지 못했습니다."
          }
        />
      )}
    </div>
  );
}
