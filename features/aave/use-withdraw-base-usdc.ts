"use client";

import { usePrivy } from "@privy-io/react-auth";
import { FormEvent, useEffect, useState } from "react";
import { formatUnits, parseUnits, type EIP1193Provider } from "viem";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getBaseUsdcWithdrawable, quoteWithdrawBaseUsdcFee, withdrawBaseUsdc } from "@/lib/aave/supply-base-usdc";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { createPaymasterFeeClient, type PaymasterFeeClient } from "@/lib/paymaster/fee-client";
import { getPaymasterToken } from "@/lib/paymaster/tokens";
import { recordAaveActivity } from "@/features/transactions/record-aave-activity";

const BASE_USDC = getPaymasterToken("base", "USDC");

export type PendingWithdraw = {
  amount: string;
  remaining: string;
  available: string;
  fee: string;
};

export type WithdrawSuccess = {
  at: Date;
  amount: string;
  remaining: string;
  fee: string;
};

export type WithdrawFailure = {
  message: string;
  code: string | null;
};

function parseWithdrawAmount(value: string): bigint | null {
  const trimmed = value.trim();
  const fraction = trimmed.split(".")[1];
  if (fraction && fraction.length > 6) return null;
  try {
    return parseUnits(trimmed, 6);
  } catch {
    return null;
  }
}

function readErrorCode(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  return message.match(/\bAA\d+\b/)?.[0] ?? null;
}

export function useWithdrawBaseUsdc() {
  const { authenticated, login, ready, getAccessToken } = usePrivy();
  const { accounts, embeddedWallet, walletsReady } = useDepositAccounts();
  const depositAddress = getDepositAddress("base", accounts);
  const [feeClient, setFeeClient] = useState<PaymasterFeeClient | null | undefined>(undefined);
  const [withdrawable, setWithdrawable] = useState<bigint | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceVersion, setBalanceVersion] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [feeText, setFeeText] = useState("계산 전");
  const [feeAmount, setFeeAmount] = useState<bigint | null>(null);
  const [feeForAmount, setFeeForAmount] = useState<bigint | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [receivedUsdc, setReceivedUsdc] = useState<string | null>(null);
  const [pendingWithdraw, setPendingWithdraw] = useState<PendingWithdraw | null>(null);
  const [success, setSuccess] = useState<WithdrawSuccess | null>(null);
  const [failure, setFailure] = useState<WithdrawFailure | null>(null);
  const parsedAmount = parseWithdrawAmount(withdrawAmount);
  const withdrawableText = isBalanceLoading
    ? "확인 중"
    : withdrawable !== null
      ? formatUnits(withdrawable, 6)
      : depositAddress
        ? "잔고를 확인할 수 없습니다"
        : "표시 예정";
  const isAmountTooLarge = parsedAmount !== null && withdrawable !== null && parsedAmount > withdrawable;

  useEffect(() => {
    if (!authenticated || !walletsReady || !embeddedWallet) {
      setFeeClient(undefined);
      return;
    }

    let cancelled = false;
    const signer = embeddedWallet;

    async function loadFeeClient() {
      try {
        const provider = await signer.getEthereumProvider();
        const request = provider.request.bind(provider) as EIP1193Provider["request"];
        const client = await createPaymasterFeeClient("base", request);
        if (cancelled) return;
        setFeeClient(client ?? null);
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setFeeClient(null);
      }
    }

    void loadFeeClient();
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletsReady, embeddedWallet]);

  // 지갑 USDC가 아니라, 이 풀에 넣어 둔 수량이다.
  useEffect(() => {
    if (!depositAddress) {
      setWithdrawable(null);
      setIsBalanceLoading(false);
      return;
    }

    let cancelled = false;
    setIsBalanceLoading(true);
    setWithdrawable(null);
    getBaseUsdcWithdrawable(depositAddress).then((value) => {
      if (cancelled) return;
      setWithdrawable(value ?? null);
      setIsBalanceLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [depositAddress, balanceVersion]);

  // 입력 수량이 있을 때만 그 수량의 withdraw 수수료를 구한다. 전송은 하지 않는다.
  useEffect(() => {
    if (!BASE_USDC || parsedAmount === null || parsedAmount <= BigInt(0) || isAmountTooLarge) {
      setFeeAmount(null);
      setFeeForAmount(null);
      setFeeText("계산 전");
      return;
    }
    if (feeClient === null) {
      setFeeAmount(null);
      setFeeText("수수료를 계산하지 못했습니다.");
      return;
    }
    if (!feeClient) {
      setFeeAmount(null);
      setFeeText("계산 중");
      return;
    }

    let cancelled = false;
    setFeeAmount(null);
    setFeeText("계산 중");
    const amount = parsedAmount;
    const timer = setTimeout(() => {
      quoteWithdrawBaseUsdcFee({ client: feeClient, amount })
        .then((costInToken) => {
          if (cancelled) return;
          setFeeAmount(costInToken);
          setFeeForAmount(amount);
          setFeeText(`${formatUnits(costInToken, BASE_USDC.decimals)} USDC`);
        })
        .catch((cause: unknown) => {
          console.error(cause);
          if (cancelled) return;
          setFeeAmount(null);
          setFeeText("수수료를 계산하지 못했습니다.");
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [feeClient, parsedAmount, isAmountTooLarge]);

  function onMaxAmount() {
    if (withdrawable === null) return;
    setWithdrawMessage(null);
    setWithdrawAmount(formatUnits(withdrawable, 6));
  }

  useEffect(() => {
    if (!pendingWithdraw || !BASE_USDC) return;
    const pendingParsed = parseWithdrawAmount(pendingWithdraw.amount);
    if (pendingParsed === null) return;

    const nextFee =
      feeAmount !== null && feeForAmount === pendingParsed
        ? `${formatUnits(feeAmount, BASE_USDC.decimals)} USDC`
        : feeText === "수수료를 계산하지 못했습니다." && withdrawAmount.trim() === pendingWithdraw.amount
          ? feeText
          : null;
    if (nextFee === null || nextFee === pendingWithdraw.fee) return;
    setPendingWithdraw({ ...pendingWithdraw, fee: nextFee });
  }, [pendingWithdraw, feeAmount, feeForAmount, feeText, withdrawAmount]);

  function onWithdraw(event: FormEvent) {
    event.preventDefault();
    setWithdrawMessage(null);
    setReceivedUsdc(null);
    setSuccess(null);
    setFailure(null);
    if (isAmountTooLarge) return;
    if (parsedAmount === null || parsedAmount <= BigInt(0) || withdrawable === null || !feeClient || !BASE_USDC) {
      setWithdrawMessage("인출을 시작하지 못했습니다.");
      return;
    }

    const fee =
      feeAmount !== null && feeForAmount === parsedAmount
        ? `${formatUnits(feeAmount, BASE_USDC.decimals)} USDC`
        : feeText;
    setPendingWithdraw({
      amount: formatUnits(parsedAmount, BASE_USDC.decimals),
      remaining: formatUnits(withdrawable - parsedAmount, BASE_USDC.decimals),
      available: formatUnits(withdrawable, BASE_USDC.decimals),
      fee,
    });
  }

  async function onConfirmWithdraw() {
    if (!pendingWithdraw || !feeClient || isWithdrawing) return;
    const amount = parseWithdrawAmount(pendingWithdraw.amount);
    if (amount === null || amount <= BigInt(0) || isAmountTooLarge) {
      setPendingWithdraw(null);
      setWithdrawMessage(isAmountTooLarge ? "꺼낼 수 있는 수량을 넘었어요." : "인출을 시작하지 못했습니다.");
      return;
    }

    // 확인 창을 먼저 대기 창으로 그린 뒤에 전송을 시작한다.
    setIsWithdrawing(true);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    try {
      const result = await withdrawBaseUsdc({ client: feeClient, amount });
      try {
        await recordAaveActivity("REDEEM", result.hash, getAccessToken);
      } catch (cause) {
        console.error(cause);
      }
      const withdrawn = formatUnits(result.received ?? amount, BASE_USDC?.decimals ?? 6);
      setWithdrawAmount("");
      setPendingWithdraw(null);
      setBalanceVersion((version) => version + 1);
      setWithdrawMessage("인출이 완료되었습니다.");
      setReceivedUsdc(withdrawn);
      setSuccess({
        at: new Date(),
        amount: withdrawn,
        remaining: pendingWithdraw.remaining,
        fee: pendingWithdraw.fee,
      });
    } catch (cause) {
      console.error(cause);
      setPendingWithdraw(null);
      setReceivedUsdc(null);
      setWithdrawMessage("인출에 실패했습니다.");
      setFailure({ message: "인출에 실패했습니다.", code: readErrorCode(cause) });
    } finally {
      setIsWithdrawing(false);
    }
  }

  function resetOutcome() {
    setWithdrawMessage(null);
    setReceivedUsdc(null);
    setSuccess(null);
    setFailure(null);
    setPendingWithdraw(null);
  }

  return {
    ready,
    authenticated,
    login,
    depositAddress,
    withdrawableText,
    withdrawAmount,
    setWithdrawAmount,
    isAmountTooLarge,
    isWithdrawing,
    withdrawMessage,
    receivedUsdc,
    pendingWithdraw,
    success,
    failure,
    maxDisabled: withdrawable === null || isBalanceLoading || isWithdrawing,
    onMaxAmount,
    onWithdraw,
    onConfirmWithdraw,
    cancelWithdraw: () => {
      if (isWithdrawing) return;
      setPendingWithdraw(null);
    },
    resetOutcome,
  };
}
