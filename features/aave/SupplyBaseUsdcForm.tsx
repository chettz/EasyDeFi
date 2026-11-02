"use client";

import { WithdrawConfirmModal } from "@/components/TransactionModal";
import { FEE_USDC_SHORT_MESSAGE, useSupplyBaseUsdc } from "@/features/aave/use-supply-base-usdc";

const fieldStyle = { border: "1px solid #888", padding: "0.5rem", marginTop: "0.25rem", width: "16rem" };
const buttonStyle = { border: "1px solid #444", padding: "0.5rem 0.75rem", background: "#fff", cursor: "pointer" };
const PRODUCT_NAME = "Aave USDC 풀(Base)";

export function SupplyBaseUsdcForm({ supplyApy }: { supplyApy: string }) {
  const supply = useSupplyBaseUsdc(supplyApy);

  return (
    <div>
      {supply.ready && !supply.authenticated && (
        <p>
          <button type="button" onClick={supply.login} style={buttonStyle}>
            Login
          </button>
        </p>
      )}
      <p>현재 잔액: {supply.balanceText} USDC</p>
      <p>예상 수수료: {supply.feeText}</p>
      <form onSubmit={(event) => void supply.onSupply(event)} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          value={supply.supplyAmount}
          onChange={(event) => supply.setSupplyAmount(event.target.value)}
          inputMode="decimal"
          aria-label="Supply 수량"
          style={fieldStyle}
        />
        <button type="button" onClick={() => void supply.onMaxAmount()} disabled={supply.maxDisabled} style={buttonStyle}>
          {supply.isMaxQuoting ? "계산 중" : "최대"}
        </button>
        <button type="submit" disabled={supply.isSupplying} style={buttonStyle}>
          Supply
        </button>
      </form>
      {supply.feeOverBalance && <p role="alert">{FEE_USDC_SHORT_MESSAGE}</p>}
      {supply.supplyMessage && <p>{supply.supplyMessage}</p>}
      {supply.receivedToken && (
        <p>
          {supply.receivedToken.amount} {supply.receivedToken.symbol}
        </p>
      )}
      {supply.pendingSupply && (
        <WithdrawConfirmModal
          pending={{
            token: "USDC",
            network: "Base",
            to: supply.depositAddress ?? "0x0000000000000000000000000000000000000000",
            amount: supply.pendingSupply.amount,
            fee: supply.pendingSupply.fee,
          }}
          isSending={supply.isSupplying}
          onConfirm={() => void supply.onConfirmSupply()}
          onCancel={supply.cancelSupply}
          title="넣기 전에 확인해주세요"
          sendingTitle="USDC를 넣고 있어요"
          rows={[
            { label: "예치 상품 이름", value: PRODUCT_NAME },
            { label: "넣는 금액", value: `${supply.pendingSupply.amount} USDC` },
            { label: "공급 연수익률(Supply APY)", value: supply.pendingSupply.apy },
            { label: "예상 수수료", value: supply.pendingSupply.fee },
          ]}
          confirmLabel="넣기"
          cancelLabel="취소"
          warning={null}
          confirmDisabled={
            supply.feeOverBalance ||
            supply.pendingSupply.fee === "계산 전" ||
            supply.pendingSupply.fee === "계산 중" ||
            supply.pendingSupply.fee === "수수료를 계산하지 못했습니다."
          }
        />
      )}
    </div>
  );
}
