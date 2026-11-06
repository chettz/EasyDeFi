"use client";

import { usePrivy } from "@privy-io/react-auth";
import { FormEvent, useEffect, useState } from "react";
import { formatUnits, parseUnits, type EIP1193Provider } from "viem";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { quoteSupplyBaseUsdcFee, supplyBaseUsdc } from "@/lib/aave/supply-base-usdc";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { createPaymasterFeeClient, type PaymasterFeeClient } from "@/lib/paymaster/fee-client";
import { getPaymasterToken } from "@/lib/paymaster/tokens";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";
import { recordAaveActivity } from "@/features/transactions/record-aave-activity";

const BASE_USDC = getPaymasterToken("base", "USDC");
// 출금 화면과 같은 문구. 수량과 수수료의 합이 잔액을 넘을 때 쓴다.
export const FEE_USDC_SHORT_MESSAGE = "수수료로 지불할 USDC가 부족합니다. 수량을 다시 조절해주세요";

export type PendingSupply = {
  amount: string;
  apy: string;
  fee: string;
};

export type SupplySuccess = {
  at: Date;
  amount: string;
  fee: string;
  receivedAmount: string | null;
  receivedSymbol: string | null;
};

export type SupplyFailure = {
  message: string;
  code: string | null;
};

// 6자리 소수까지 숫자로 읽는다. 빈 값과 잘못된 형식은 null이다.
export function parseSupplyAmount(value: string): bigint | null {
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

export function useSupplyBaseUsdc(supplyApy: string) {
  const { authenticated, login, ready, getAccessToken } = usePrivy();
  const { accounts, embeddedWallet, walletsReady } = useDepositAccounts();
  const depositAddress = getDepositAddress("base", accounts);
  const [feeClient, setFeeClient] = useState<PaymasterFeeClient | null | undefined>(undefined);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceVersion, setBalanceVersion] = useState(0);
  const [supplyAmount, setSupplyAmount] = useState("");
  const [feeText, setFeeText] = useState("계산 전");
  const [feeAmount, setFeeAmount] = useState<bigint | null>(null);
  const [feeForAmount, setFeeForAmount] = useState<bigint | null>(null);
  const [isMaxQuoting, setIsMaxQuoting] = useState(false);
  const [isSupplying, setIsSupplying] = useState(false);
  const [supplyMessage, setSupplyMessage] = useState<string | null>(null);
  const [receivedToken, setReceivedToken] = useState<{ amount: string; symbol: string } | null>(null);
  const [pendingSupply, setPendingSupply] = useState<PendingSupply | null>(null);
  const [success, setSuccess] = useState<SupplySuccess | null>(null);
  const [failure, setFailure] = useState<SupplyFailure | null>(null);
  const parsedAmount = parseSupplyAmount(supplyAmount);
  const balanceText = isBalanceLoading
    ? "확인 중"
    : balance !== null
      ? formatUnits(balance, 6)
      : depositAddress
        ? "잔고를 확인할 수 없습니다"
        : "표시 예정";
  const feeOverBalance =
    feeAmount !== null &&
    feeForAmount !== null &&
    parsedAmount !== null &&
    parsedAmount === feeForAmount &&
    balance !== null &&
    parsedAmount + feeAmount > balance;
  const maxDisabled = balance === null || !feeClient || !BASE_USDC || isMaxQuoting || isBalanceLoading;

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

  useEffect(() => {
    if (!depositAddress) {
      setBalance(null);
      setIsBalanceLoading(false);
      return;
    }

    let cancelled = false;
    setIsBalanceLoading(true);
    setBalance(null);
    getDepositTokenBalance("USDC", "base", depositAddress).then((value) => {
      if (cancelled) return;
      setBalance(value ?? null);
      setIsBalanceLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [depositAddress, balanceVersion]);

  useEffect(() => {
    if (!BASE_USDC || parsedAmount === null || parsedAmount <= BigInt(0)) {
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
      quoteSupplyBaseUsdcFee({ client: feeClient, amount })
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
  }, [feeClient, parsedAmount]);

  useEffect(() => {
    if (!pendingSupply || !BASE_USDC) return;
    const pendingParsed = parseSupplyAmount(pendingSupply.amount);
    if (pendingParsed === null) return;

    const nextFee =
      feeAmount !== null && feeForAmount === pendingParsed
        ? `${formatUnits(feeAmount, BASE_USDC.decimals)} USDC`
        : feeText === "수수료를 계산하지 못했습니다." && supplyAmount.trim() === pendingSupply.amount
          ? feeText
          : null;
    if (nextFee === null || nextFee === pendingSupply.fee) return;
    setPendingSupply({ ...pendingSupply, fee: nextFee });
  }, [pendingSupply, feeAmount, feeForAmount, feeText, supplyAmount]);

  async function onMaxAmount() {
    if (balance === null || !feeClient || !BASE_USDC || isMaxQuoting) return;

    setIsMaxQuoting(true);
    setSupplyMessage(null);
    try {
      const costInToken = await quoteSupplyBaseUsdcFee({
        client: feeClient,
        amount: parseUnits("1", BASE_USDC.decimals),
      });
      const maxAmount = balance > costInToken ? balance - costInToken : BigInt(0);
      setSupplyAmount(formatUnits(maxAmount, BASE_USDC.decimals));
    } catch (cause) {
      console.error(cause);
      setSupplyMessage("수수료를 계산하지 못했습니다.");
    } finally {
      setIsMaxQuoting(false);
    }
  }

  function onSupply(event: FormEvent) {
    event.preventDefault();
    setSupplyMessage(null);
    setReceivedToken(null);
    setSuccess(null);
    setFailure(null);
    if (feeOverBalance) return;

    const trimmedAmount = supplyAmount.trim();
    const fractionDigits = trimmedAmount.split(".")[1];
    if (!trimmedAmount || (fractionDigits && fractionDigits.length > 6)) {
      setSupplyMessage("수량을 정확히 입력해주세요");
      return;
    }

    if (parsedAmount === null || parsedAmount <= BigInt(0) || !feeClient || !BASE_USDC) {
      setSupplyMessage("공급을 시작하지 못했습니다.");
      return;
    }

    const fee =
      feeAmount !== null && feeForAmount === parsedAmount
        ? `${formatUnits(feeAmount, BASE_USDC.decimals)} USDC`
        : feeText;
    setPendingSupply({
      amount: formatUnits(parsedAmount, BASE_USDC.decimals),
      apy: supplyApy,
      fee,
    });
  }

  async function onConfirmSupply() {
    if (!pendingSupply || !feeClient || isSupplying) return;
    const amount = parseSupplyAmount(pendingSupply.amount);
    if (amount === null || amount <= BigInt(0) || feeOverBalance) {
      setPendingSupply(null);
      const message = feeOverBalance ? FEE_USDC_SHORT_MESSAGE : "공급을 시작하지 못했습니다.";
      setSupplyMessage(message);
      setFailure({ message, code: null });
      return;
    }

    setIsSupplying(true);
    try {
      const result = await supplyBaseUsdc({ client: feeClient, amount });
      try {
        await recordAaveActivity("SUPPLY", result.hash, getAccessToken);
      } catch (cause) {
        console.error(cause);
      }
      const receivedTokenValue = result.received
        ? {
            amount: formatUnits(result.received.amount, result.received.decimals),
            symbol: result.received.symbol,
          }
        : null;
      setSupplyAmount("");
      setPendingSupply(null);
      setBalanceVersion((version) => version + 1);
      setSupplyMessage("공급이 완료되었어요");
      setReceivedToken(receivedTokenValue);
      setSuccess({
        at: new Date(),
        amount: formatUnits(amount, 6),
        fee: pendingSupply.fee,
        receivedAmount: receivedTokenValue?.amount ?? null,
        receivedSymbol: receivedTokenValue?.symbol ?? null,
      });
    } catch (cause) {
      console.error(cause);
      setPendingSupply(null);
      setReceivedToken(null);
      setSupplyMessage("공급에 실패했습니다.");
      setFailure({ message: "공급에 실패했습니다.", code: readErrorCode(cause) });
    } finally {
      setIsSupplying(false);
    }
  }

  function resetOutcome() {
    setSupplyMessage(null);
    setReceivedToken(null);
    setSuccess(null);
    setFailure(null);
    setPendingSupply(null);
  }

  return {
    ready,
    authenticated,
    login,
    depositAddress,
    balanceText,
    supplyAmount,
    setSupplyAmount,
    feeText,
    isMaxQuoting,
    maxDisabled,
    feeOverBalance,
    isSupplying,
    supplyMessage,
    receivedToken,
    pendingSupply,
    success,
    failure,
    onMaxAmount,
    onSupply,
    onConfirmSupply,
    cancelSupply: () => {
      if (isSupplying) return;
      setPendingSupply(null);
    },
    resetOutcome,
  };
}
