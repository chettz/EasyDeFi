"use client";

import { usePrivy } from "@privy-io/react-auth";
import { isAddress as isSolanaAddress } from "@solana/kit";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  toHex,
  type EIP1193Provider,
  type Hash,
} from "viem";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import {
  UsdcCompleteModal,
  WithdrawConfirmModal,
  type PendingWithdraw,
} from "@/components/TransactionModal";
import {
  WithdrawFailure,
  WithdrawSuccess,
  type CompletedWithdraw,
} from "@/features/withdraw/WithdrawResult";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { TOKEN_NETWORKS, type DepositNetwork, type DepositToken } from "@/lib/deposit/networks";
import { getTokenContract } from "@/lib/deposit/token-contracts";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";
import { quoteTransferFee } from "@/lib/withdraw/quote-transfer-fee";
import { createArcFeeClient, type ArcFeeClient } from "@/lib/withdraw/arc-fee-client";
import { quoteArcSendFee } from "@/lib/withdraw/quote-arc-send-fee";
import { quoteKaiaSendFee } from "@/lib/withdraw/quote-kaia-send-fee";
import { sendArcTransfer } from "@/lib/withdraw/send-arc-transfer";
import { sendKaiaTransfer } from "@/lib/withdraw/send-kaia-transfer";
import { sendPaymasterTransfer } from "@/lib/withdraw/send-paymaster-transfer";
import { createPaymasterFeeClient, type PaymasterFeeClient } from "@/lib/paymaster/fee-client";
import { getPaymasterToken } from "@/lib/paymaster/tokens";

const EVM_WITHDRAW_NETWORKS = ["이더리움", "sepolia", "카이아", "kaiaKairos", "아크", "arcTestnet", "base", "baseSepolia"] as const;
const SOLANA_WITHDRAW_NETWORKS = ["솔라나", "Devnet"] as const;

const FEE_NETWORKS = ["이더리움", "sepolia", "base", "baseSepolia"] as const;
type FeeNetwork = (typeof FEE_NETWORKS)[number];

const ARC_FEE_NETWORKS = ["아크", "arcTestnet"] as const;
type ArcFeeNetwork = (typeof ARC_FEE_NETWORKS)[number];

const KAIA_FEE_NETWORKS = ["카이아", "kaiaKairos"] as const;
type KaiaFeeNetwork = (typeof KAIA_FEE_NETWORKS)[number];

const FEE_USDC_SHORT_MESSAGE = "수수료로 지불할 USDC가 부족합니다. 수량을 다시 조절해주세요";
const FEE_USDT_SHORT_MESSAGE = "수수료로 지불할 USDT가 부족합니다. 수량을 다시 조절해주세요";
const labFieldStyle = {
  width: "100%",
  marginTop: "0.25rem",
  border: "1px solid #888",
  padding: "0.5rem",
};
// 최대 버튼 견적용 받는 주소. 실제 출금 주소가 아니고, 전송 가스는 이 주소에 거의 달라지지 않는다.
const FEE_QUOTE_RECIPIENT = "0x0000000000000000000000000000000000000001";

// 이더리움·sepolia·base·baseSepolia처럼 ERC-20 paymaster로 수수료를 견적하는 네트워크인지 확인한다.
function isFeeNetwork(network: string): network is FeeNetwork {
  return (FEE_NETWORKS as readonly string[]).includes(network);
}

// 아크·arcTestnet처럼 네이티브 USDC 가스로 수수료를 견적하는 네트워크인지 확인한다.
function isArcFeeNetwork(network: string): network is ArcFeeNetwork {
  return (ARC_FEE_NETWORKS as readonly string[]).includes(network);
}

// 카이아·kaiaKairos처럼 USDT 스왑으로 가스비를 견적하는 네트워크인지 확인한다.
function isKaiaFeeNetwork(network: string): network is KaiaFeeNetwork {
  return (KAIA_FEE_NETWORKS as readonly string[]).includes(network);
}

function isDepositNetwork(network: string): network is DepositNetwork {
  return (Object.values(TOKEN_NETWORKS).flat() as readonly string[]).includes(network);
}

// 견적 오류와 그 원인에 적힌 메시지를 한 문자열로 모은다.
function errorText(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const details = "details" in cause ? String(cause.details ?? "") : "";
  return `${cause.message}\n${details}\n${errorText(cause.cause)}`;
}

// 전송 뒤에 수수료로 낼 USDC가 없어 견적이 실패했는지 확인한다.
function isPaymasterFeeShortfall(cause: unknown) {
  const text = errorText(cause);
  return text.includes("postOp") || text.includes("AA50") || text.includes("7939f424");
}

// 소수 7자리부터는 입력칸에 넣지 않는다.
function limitWithdrawAmountInput(value: string): string {
  const dot = value.indexOf(".");
  if (dot === -1) return value;
  return value.slice(0, dot + 1 + 6);
}

// 6자리 소수까지 숫자로 읽는다. 빈 값과 잘못된 형식은 null이다.
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

export function WithdrawFlow({ variant = "product" }: { variant?: "lab" | "product" }) {
  const { authenticated } = usePrivy();
  const { accounts, embeddedWallet, walletsReady } = useDepositAccounts();
  const [token, setToken] = useState<DepositToken>("USDC");
  const [network, setNetwork] = useState<DepositNetwork>("이더리움");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [feeHandles, setFeeHandles] = useState<Partial<Record<FeeNetwork, PaymasterFeeClient | null>>>({});
  const [arcFeeHandles, setArcFeeHandles] = useState<Partial<Record<ArcFeeNetwork, ArcFeeClient | null>>>({});
  const [feeText, setFeeText] = useState("계산 전");
  const [feeAmount, setFeeAmount] = useState<bigint | null>(null);
  // feeAmount가 어느 출금 수량에 대한 견적인지. 수량이 다르면 합을 비교하지 않는다.
  const [feeForAmount, setFeeForAmount] = useState<bigint | null>(null);
  // 최대 버튼이 1 USDC 수수료로 넣은 수량. 그 수량의 재견적이 더 크면 수량만 다시 맞춘다.
  const arcMaxFill = useRef<string | null>(null);
  // 재견적 수수료에 맞춘 최대 수량은 다시 견적하지 않는다.
  const arcMaxSettled = useRef<string | null>(null);
  // 최대 버튼이 1 USDT 수수료로 넣은 수량. 그 수량의 재견적이 더 크면 수량만 다시 맞춘다.
  const kaiaMaxFill = useRef<string | null>(null);
  // 재견적 수수료에 맞춘 카이아 최대 수량은 다시 견적하지 않는다.
  const kaiaMaxSettled = useRef<string | null>(null);
  const [isFeeShortfall, setIsFeeShortfall] = useState(false);
  const [isMaxQuoting, setIsMaxQuoting] = useState(false);
  const [pendingWithdraw, setPendingWithdraw] = useState<PendingWithdraw | null>(null);
  const [completedWithdraw, setCompletedWithdraw] = useState<CompletedWithdraw | null>(null);
  const [failedWithdraw, setFailedWithdraw] = useState<PendingWithdraw | null>(null);
  const [failureMessage, setFailureMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const networks = TOKEN_NETWORKS[token];
  const depositAddress = getDepositAddress(network, accounts);
  const balanceText = isBalanceLoading
    ? "확인 중"
    : balance !== null
      ? formatUnits(balance, 6)
      : depositAddress // balance가 null일 경우(조회 실패)
        ? "잔고를 확인할 수 없습니다"
        : "표시 예정"; // 주소가 없을 경우
  const isUnsupportedSolana = (SOLANA_WITHDRAW_NETWORKS as readonly string[]).includes(network);
  const parsedAmount = parseWithdrawAmount(amount);
  const isAmountInvalid = amount.trim() !== "" && parsedAmount === null;
  const isAmountNonPositive = parsedAmount !== null && parsedAmount <= BigInt(0);
  // 현재 잔액과 같으면 통과하고, 잔액보다 클 때만 출금을 막는다.
  const isAmountTooLarge = parsedAmount !== null && balance !== null && parsedAmount > balance;
  // 지금 입력된 수량으로 구한 수수료가 돌아온 뒤에만, 그 둘의 합이 잔액을 넘는지 본다.
  const isArcFeeOverBalance =
    isArcFeeNetwork(network) &&
    feeAmount !== null &&
    feeForAmount !== null &&
    parsedAmount !== null &&
    parsedAmount === feeForAmount &&
    balance !== null &&
    parsedAmount + feeAmount > balance;
  // 카이아도 입력 수량으로 구한 USDT 수수료가 돌아온 뒤에만 합을 잔액과 비교한다.
  const isKaiaFeeOverBalance =
    isKaiaFeeNetwork(network) &&
    feeAmount !== null &&
    feeForAmount !== null &&
    parsedAmount !== null &&
    parsedAmount === feeForAmount &&
    balance !== null &&
    parsedAmount + feeAmount > balance;
  const maxFeeHandle = isFeeNetwork(network) ? feeHandles[network] : undefined;
  const arcMaxHandle = isArcFeeNetwork(network) ? arcFeeHandles[network] : undefined;
  const canQuoteMax =
    balance !== null &&
    ((isFeeNetwork(network) && Boolean(getPaymasterToken(network, token)) && Boolean(maxFeeHandle)) ||
      (isArcFeeNetwork(network) && token === "USDC" && Boolean(arcMaxHandle)) ||
      (isKaiaFeeNetwork(network) && token === "USDT" && isAddress(depositAddress ?? "")));

  // 이더리움·sepolia·base·baseSepolia 수수료 견적에 쓸 smartAccountClient 생성. 전송은 하지 않는다.
  useEffect(() => {
    if (!authenticated || !walletsReady || !embeddedWallet) {
      setFeeHandles({});
      return;
    }

    let cancelled = false;
    const signer = embeddedWallet;

    async function loadFeeClients() {
      try {
        const provider = await signer.getEthereumProvider();
        const request = provider.request.bind(provider) as EIP1193Provider["request"];
        const [ethereum, sepoliaClient, baseClient, baseSepoliaClient] = await Promise.all([
          createPaymasterFeeClient("이더리움", request),
          createPaymasterFeeClient("sepolia", request),
          createPaymasterFeeClient("base", request),
          createPaymasterFeeClient("baseSepolia", request),
        ]);
        if (cancelled) return;
        setFeeHandles({
          이더리움: ethereum ?? null,
          sepolia: sepoliaClient ?? null,
          base: baseClient ?? null,
          baseSepolia: baseSepoliaClient ?? null,
        });
      } catch (cause) {
        console.error(cause);
        if (cancelled) return;
        setFeeHandles({ 이더리움: null, sepolia: null, base: null, baseSepolia: null });
      }
    }

    void loadFeeClients();
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletsReady, embeddedWallet]);

  // 아크·arcTestnet 네이티브 USDC 수수료 견적에 쓸 Kernel client를 만든다. 전송은 하지 않는다.
  useEffect(() => {
    if (!authenticated || !walletsReady || !embeddedWallet) {
      setArcFeeHandles({});
      return;
    }

    let cancelled = false;
    const signer = embeddedWallet;

    async function loadArcFeeClients() {
      try {
        const provider = await signer.getEthereumProvider();
        const request = provider.request.bind(provider) as EIP1193Provider["request"];
        const [arcClient, arcTestnetClient] = await Promise.all([
          createArcFeeClient("아크", request),
          createArcFeeClient("arcTestnet", request),
        ]);
        if (cancelled) return;
        setArcFeeHandles({
          아크: arcClient ?? null,
          arcTestnet: arcTestnetClient ?? null,
        });
      } catch (cause) {
        console.error(cause);
        if (cancelled) return;
        setArcFeeHandles({ 아크: null, arcTestnet: null });
      }
    }

    void loadArcFeeClients();
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletsReady, embeddedWallet]);

  // 출금 주소와 수량이 유효하면 예상 최대 수수료를 계산
  // 입력이 잠시 멈춘 뒤에 한 번만 요청
  useEffect(() => {
    const settledKey = `${network}:${token}:${amount}`;
    if (arcMaxSettled.current === settledKey || kaiaMaxSettled.current === settledKey) return;
    if (arcMaxSettled.current) arcMaxSettled.current = null;
    if (kaiaMaxSettled.current) kaiaMaxSettled.current = null;

    if (isAmountTooLarge) {
      setFeeAmount(null);
      setFeeForAmount(null);
      setFeeText("계산 전");
      setIsFeeShortfall(false);
      return;
    }

    // 아크 수수료 견적 체크
    if (isArcFeeNetwork(network)) {
      const handle = arcFeeHandles[network];
      if (token !== "USDC" || !isAddress(recipient) || parsedAmount === null) {
        setFeeAmount(null);
        setFeeForAmount(null);
        setFeeText("계산 전");
        setIsFeeShortfall(false);
        return;
      }
      if (handle === null) {
        setFeeAmount(null);
        setFeeForAmount(null);
        setFeeText("수수료를 계산하지 못했습니다.");
        setIsFeeShortfall(false);
        return;
      }
      if (!handle) {
        setFeeAmount(null);
        setFeeForAmount(null);
        setFeeText("계산 중");
        setIsFeeShortfall(false);
        return;
      }

      let cancelled = false;
      setFeeAmount(null);
      setFeeForAmount(null);
      setFeeText("계산 중");
      setIsFeeShortfall(false);
      const timer = setTimeout(() => {
        // 입력한 주소와 수량으로 네이티브 USDC 전송 수수료 계산
        quoteArcSendFee({
          client: handle,
          recipient,
          amount: parsedAmount,
        })
          .then((costInToken) => {
            if (cancelled) return;
            const fromMax = arcMaxFill.current === `${network}:${token}:${amount}`;
            if (fromMax) arcMaxFill.current = null;
            let appliedAmount = parsedAmount;
            // 1 USDC 수수료로 넣은 수량보다 이 수량 견적 수수료가 크면, 수량을 이 수수료에 맞춘다.
            if (fromMax && balance !== null && parsedAmount + costInToken > balance) {
              appliedAmount = balance > costInToken ? balance - costInToken : BigInt(0);
              const adjustedText = formatUnits(appliedAmount, 6);
              arcMaxSettled.current = `${network}:${token}:${adjustedText}`;
              setAmount(adjustedText);
            }
            setFeeAmount(costInToken);
            setFeeForAmount(appliedAmount);
            setFeeText(`${formatUnits(costInToken, 6)} ${token}`);
            setIsFeeShortfall(false);
          })
          .catch((cause: unknown) => {
            console.error(cause);
            if (cancelled) return;
            setFeeAmount(null);
            setFeeForAmount(null);
            setFeeText("수수료를 계산하지 못했습니다.");
            setIsFeeShortfall(false);
          });
      }, 400);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // 카이아 수수료 견적 체크
    if (isKaiaFeeNetwork(network)) {
      const sender = depositAddress;
      if (token !== "USDT" || !sender || !isAddress(sender) || !isAddress(recipient) || parsedAmount === null) {
        setFeeAmount(null);
        setFeeForAmount(null);
        setFeeText("계산 전");
        setIsFeeShortfall(false);
        return;
      }

      let cancelled = false;
      setFeeAmount(null);
      setFeeForAmount(null);
      setFeeText("계산 중");
      setIsFeeShortfall(false);
      const timer = setTimeout(() => {
        // 입력한 주소와 수량으로 USDT 전송 수수료 계산
        quoteKaiaSendFee({
          network,
          sender,
          recipient,
          amount: parsedAmount,
        })
          .then((costInToken) => {
            if (cancelled) return;
            const fromMax = kaiaMaxFill.current === `${network}:${token}:${amount}`;
            if (fromMax) kaiaMaxFill.current = null;
            let appliedAmount = parsedAmount;
            // 1 USDT 수수료로 넣은 수량보다 이 수량 견적 수수료가 크면, 수량을 이 수수료에 맞춘다.
            if (fromMax && balance !== null && parsedAmount + costInToken > balance) {
              appliedAmount = balance > costInToken ? balance - costInToken : BigInt(0);
              const adjustedText = formatUnits(appliedAmount, 6);
              kaiaMaxSettled.current = `${network}:${token}:${adjustedText}`;
              setAmount(adjustedText);
            }
            setFeeAmount(costInToken);
            setFeeForAmount(appliedAmount);
            setFeeText(`${formatUnits(costInToken, 6)} ${token}`);
            setIsFeeShortfall(false);
          })
          .catch((cause: unknown) => {
            console.error(cause);
            if (cancelled) return;
            setFeeAmount(null);
            setFeeForAmount(null);
            setFeeText("수수료를 계산하지 못했습니다.");
            setIsFeeShortfall(false);
          });
      }, 400);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // 이더리움·sepolia·base·baseSepolia 수수료 견적 체크
    if (!isFeeNetwork(network)) {
      setFeeAmount(null);
      setFeeText("계산 전");
      setIsFeeShortfall(false);
      return;
    }
    const paymasterToken = getPaymasterToken(network, token);
    const handle = feeHandles[network];
    if (!paymasterToken || !isAddress(recipient) || parsedAmount === null) {
      setFeeAmount(null);
      setFeeText("계산 전");
      setIsFeeShortfall(false);
      return;
    }
    if (handle === null) {
      setFeeAmount(null);
      setFeeText("수수료를 계산하지 못했습니다.");
      setIsFeeShortfall(false);
      return;
    }
    if (!handle) {
      setFeeAmount(null);
      setFeeText("계산 중");
      setIsFeeShortfall(false);
      return;
    }

    let cancelled = false;
    setFeeAmount(null);
    setFeeText("계산 중");
    setIsFeeShortfall(false);
    const timer = setTimeout(() => {
      // 입력한 주소와 수량으로 출금 수수료 계산
      quoteTransferFee({
        client: handle,
        token: paymasterToken.address,
        tokenDecimals: paymasterToken.decimals,
        recipient,
        amount: parsedAmount,
      })
        .then((costInToken) => {
          if (cancelled) return;
          setFeeAmount(costInToken);
          setFeeForAmount(parsedAmount);
          setFeeText(`${formatUnits(costInToken, paymasterToken.decimals)} ${token}`);
          setIsFeeShortfall(false);
        })
        .catch((cause: unknown) => {
          console.error(cause);
          if (cancelled) return;
          setFeeAmount(null);
          setFeeText("수수료를 계산하지 못했습니다.");
          setIsFeeShortfall(isPaymasterFeeShortfall(cause));
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount, network, token, recipient, parsedAmount, balance, depositAddress, feeHandles, arcFeeHandles, isAmountTooLarge]);

  // 입금 주소가 정해지면 그 주소의 선택 토큰 잔고 읽음
  useEffect(() => {
    if (!depositAddress || !getTokenContract(token, network)) {
      setBalance(null);
      setIsBalanceLoading(false);
      return;
    }

    let cancelled = false;
    setIsBalanceLoading(true);
    setBalance(null);
    // 잔고 조회
    getDepositTokenBalance(token, network, depositAddress).then((value) => {
      if (cancelled) return;
      setBalance(value ?? null);
      setIsBalanceLoading(false); // 잔고 조회 완료
    });

    return () => {
      cancelled = true;
    };
  }, [token, network, depositAddress]);

  // 토큰 변경 시 네트워크 자동 변경
  function onTokenChange(nextToken: DepositToken) {
    setToken(nextToken);
    const nextNetworks = TOKEN_NETWORKS[nextToken];
    if (!nextNetworks.some((item) => item === network)) {
      setNetwork(nextNetworks[0]);
    }
  }

  // '최대' 버튼 클릭 시 1 토큰 전송 견적으로 수수료를 구하고, 잔액에서 그 수수료를 뺀 값을 출금 수량에 넣는다.
  async function onMaxAmount() {
    if (balance === null || isMaxQuoting) return;

    if (isKaiaFeeNetwork(network)) {
      const sender = depositAddress;
      if (token !== "USDT" || !sender || !isAddress(sender)) return;

      setIsMaxQuoting(true);
      setError(null);
      try {
        // 고정 주소로 1 USDT를 보내는 견적으로 예상 수수료를 구한다.
        const costInToken = await quoteKaiaSendFee({
          network,
          sender,
          recipient: FEE_QUOTE_RECIPIENT,
          amount: parseUnits("1", 6),
        });
        // 1 USDT 수수료를 뺀 수량을 먼저 넣는다. 이 수량의 재견적이 더 크면 effect가 수량을 다시 맞춘다.
        const maxAmount = balance > costInToken ? balance - costInToken : BigInt(0);
        const formatted = formatUnits(maxAmount, 6);
        kaiaMaxFill.current = `${network}:${token}:${formatted}`;
        setAmount(formatted);
      } catch (cause) {
        console.error(cause);
        setError("수수료를 계산하지 못했습니다.");
      } finally {
        setIsMaxQuoting(false);
      }
      return;
    }

    if (isArcFeeNetwork(network)) {
      const handle = arcFeeHandles[network];
      if (token !== "USDC" || !handle) return;

      setIsMaxQuoting(true);
      setError(null);
      try {
        // 고정 주소로 1 USDC를 네이티브 전송하는 견적으로 예상 최대 수수료를 구한다.
        const costInToken = await quoteArcSendFee({
          client: handle,
          recipient: FEE_QUOTE_RECIPIENT,
          amount: parseUnits("1", 6),
        });
        // 1 USDC 수수료를 뺀 수량을 먼저 넣는다. 이 수량의 재견적이 더 크면 effect가 수량을 다시 맞춘다.
        const maxAmount = balance > costInToken ? balance - costInToken : BigInt(0);
        const formatted = formatUnits(maxAmount, 6);
        arcMaxFill.current = `${network}:${token}:${formatted}`;
        setAmount(formatted);
      } catch (cause) {
        console.error(cause);
        setError("수수료를 계산하지 못했습니다.");
      } finally {
        setIsMaxQuoting(false);
      }
      return;
    }

    if (!isFeeNetwork(network)) return;
    const paymasterToken = getPaymasterToken(network, token);
    const handle = feeHandles[network];
    if (!paymasterToken || !handle) return;

    setIsMaxQuoting(true);
    setError(null);
    try {
      // 고정 주소로 1 USDC를 보내는 견적으로 예상 최대 수수료를 구한다.
      const costInToken = await quoteTransferFee({
        client: handle,
        token: paymasterToken.address,
        tokenDecimals: paymasterToken.decimals,
        recipient: FEE_QUOTE_RECIPIENT,
        amount: parseUnits("1", paymasterToken.decimals),
      });
      // 현재 잔액에서 그 수수료를 뺀 값을 출금 수량에 넣는다.
      const maxAmount = balance > costInToken ? balance - costInToken : BigInt(0);
      setAmount(formatUnits(maxAmount, paymasterToken.decimals));
    } catch (cause) {
      console.error(cause);
      setError("수수료를 계산하지 못했습니다.");
    } finally {
      setIsMaxQuoting(false);
    }
  }

  // 수량과 주소가 유효하면 확인 팝업을 연다. 트랜잭션은 보내지 않는다.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const to = recipient;
    if (
      isUnsupportedSolana ||
      isAmountInvalid ||
      isAmountNonPositive ||
      isAmountTooLarge ||
      isFeeShortfall ||
      isArcFeeOverBalance ||
      isKaiaFeeOverBalance
    ) return;

    const isEvmNetwork = (EVM_WITHDRAW_NETWORKS as readonly string[]).includes(network);
    const isSolanaNetwork = (SOLANA_WITHDRAW_NETWORKS as readonly string[]).includes(network);
    if ((isEvmNetwork && !isAddress(to)) || (isSolanaNetwork && !isSolanaAddress(to))) {
      setError("올바른 출금 주소를 입력해 주세요.");
      return;
    }

    setError(null);
    setIsSending(false);
    // 현재 수량 견적이 있으면 그 숫자를 넣고, 아직이면 계산중.. 솔라나·Devnet은 견적이 없다.
    const fee =
      isSolanaNetwork
        ? "표시예정"
        : feeAmount !== null && feeForAmount !== null && parsedAmount !== null && feeForAmount === parsedAmount
          ? `${formatUnits(feeAmount, 6)} ${token}`
          : feeText === "수수료를 계산하지 못했습니다."
            ? feeText
            : "계산중..";
    setPendingWithdraw({ token, network, to, amount, fee });
  }

  // 확인을 누르면 페이마스터, 아크, 카이아를 전송한다. 솔라나는 아직 보내지 않는다.
  async function onConfirmWithdraw(request = pendingWithdraw) {
    if (!request || isSending) return;
    const networkName = request.network;
    const parsed = parseWithdrawAmount(request.amount);
    if (parsed === null || !isAddress(request.to)) {
      setPendingWithdraw(null);
      setIsSending(false);
      setError("전송을 시작하지 못했습니다.");
      return;
    }
    const recipient = request.to;
    const sentToken = request.token;
    const amountToSend = parsed;

    function failTransfer() {
      setFailedWithdraw(request);
      setFailureMessage("주소와 네트워크를 확인하고 다시 시도해 주세요.");
      setPendingWithdraw(null);
      setIsSending(false);
    }

    setFailedWithdraw(null);
    setPendingWithdraw(request);

    async function finish(gas: bigint | null) {
      setCompletedWithdraw({
        recipient,
        amount: amountToSend,
        gas,
        token: sentToken,
        network: networkName,
        completedAt: new Date(),
      });
      setAmount("");
      setPendingWithdraw(null);
      setIsSending(false);
      if (depositAddress && (sentToken === "USDC" || sentToken === "USDT") && isDepositNetwork(networkName)) {
        const nextBalance = await getDepositTokenBalance(sentToken, networkName, depositAddress);
        if (nextBalance !== undefined) setBalance(nextBalance);
      }
    }

    if (isFeeNetwork(networkName)) {
      const paymasterToken = getPaymasterToken(networkName, sentToken);
      const handle = feeHandles[networkName];
      if (!paymasterToken || !handle) {
        setPendingWithdraw(null);
        setIsSending(false);
        setError("전송을 시작하지 못했습니다.");
        return;
      }

      setError(null);
      setIsSending(true);
      try {
        const { gas } = await sendPaymasterTransfer({
          client: handle,
          token: paymasterToken.address,
          recipient,
          amount: parsed,
        });
        await finish(gas);
      } catch (cause) {
        console.error(cause);
        failTransfer();
      }
      return;
    }

    if (isArcFeeNetwork(networkName)) {
      const handle = arcFeeHandles[networkName];
      if (sentToken !== "USDC" || !handle) {
        setPendingWithdraw(null);
        setIsSending(false);
        setError("전송을 시작하지 못했습니다.");
        return;
      }

      setError(null);
      setIsSending(true);
      try {
        // 받는 주소로 네이티브 USDC value를 보낸다. 페이마스터는 쓰지 않는다.
        const { gas } = await sendArcTransfer({ client: handle, recipient, amount: parsed });
        await finish(gas);
      } catch (cause) {
        console.error(cause);
        failTransfer();
      }
      return;
    }

    if (isKaiaFeeNetwork(networkName)) {
      if (sentToken !== "USDT" || !embeddedWallet || !isAddress(embeddedWallet.address)) {
        setPendingWithdraw(null);
        setIsSending(false);
        setError("전송을 시작하지 못했습니다.");
        return;
      }
      const sender = embeddedWallet.address;

      setError(null);
      setIsSending(true);
      try {
        // 라우터 승인과 USDT 스왑 뒤에, 같은 EOA에서 USDT를 보낸다.
        const { gas } = await sendKaiaTransfer({
          network: networkName,
          sender,
          recipient,
          amount: parsed,
          switchChain: async (chainId) => {
            await embeddedWallet.switchChain(chainId);
            const provider = await embeddedWallet.getEthereumProvider();
            const hexChainId = `0x${chainId.toString(16)}`;
            // 이미 그 체인이면 스위치 요청이 거절될 수 있다. 실제 체인 번호로 확인한다.
            try {
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: hexChainId }],
              });
            } catch (cause) {
              console.error(cause);
            }
            const current = await provider.request({ method: "eth_chainId" });
            if (typeof current !== "string" || Number(current) !== chainId) {
              throw new Error("Wallet chain did not switch.");
            }
          },
          signTransaction: async (tx) => {
            const provider = await embeddedWallet.getEthereumProvider();
            const signed = await provider.request({
              method: "eth_signTransaction",
              params: [
                {
                  from: tx.from,
                  to: tx.to,
                  data: tx.data,
                  nonce: toHex(tx.nonce),
                  gasLimit: toHex(tx.gas),
                  gasPrice: toHex(tx.gasPrice),
                  // 가스리스 판별은 레거시 트랜잭션만 인정한다.
                  type: 0,
                  chainId: tx.chainId,
                  value: "0x0",
                },
              ],
            });
            if (typeof signed !== "string" || !signed.startsWith("0x")) {
              throw new Error("Signed transaction was not returned.");
            }
            return signed as Hash;
          },
          sendTransaction: async (tx) => {
            const provider = await embeddedWallet.getEthereumProvider();
            const hash = await provider.request({
              method: "eth_sendTransaction",
              params: [
                {
                  from: tx.from,
                  to: tx.to,
                  data: tx.data,
                  nonce: toHex(tx.nonce),
                  gas: toHex(tx.gas),
                  gasPrice: toHex(tx.gasPrice),
                  maxFeePerGas: toHex(tx.gasPrice),
                  maxPriorityFeePerGas: toHex(tx.gasPrice),
                  type: 2,
                  chainId: toHex(tx.chainId),
                },
              ],
            });
            if (typeof hash !== "string") throw new Error("Transaction hash was not returned.");
            return hash as Hash;
          },
        });
        await finish(gas);
      } catch (cause) {
        console.error(cause);
        failTransfer();
      }
      return;
    }

    setPendingWithdraw(null);
    setIsSending(false);
    setError("이 네트워크의 전송은 아직 연결되지 않았습니다.");
  }

  // 팝업을 연 뒤 견적이 끝나면, 그때 연 수량의 수수료로 문구를 바꾼다.
  useEffect(() => {
    if (!pendingWithdraw) return;
    if ((SOLANA_WITHDRAW_NETWORKS as readonly string[]).includes(pendingWithdraw.network)) return;
    const pendingParsed = parseWithdrawAmount(pendingWithdraw.amount);
    if (pendingParsed === null) return;

    const nextFee =
      feeAmount !== null && feeForAmount === pendingParsed
        ? `${formatUnits(feeAmount, 6)} ${pendingWithdraw.token}`
        : feeText === "수수료를 계산하지 못했습니다." && amount === pendingWithdraw.amount
          ? feeText
          : null;
    if (nextFee === null || nextFee === pendingWithdraw.fee) return;
    setPendingWithdraw({ ...pendingWithdraw, fee: nextFee });
  }, [pendingWithdraw, feeAmount, feeForAmount, feeText, amount]);

  if (variant === "product" && completedWithdraw) {
    return (
      <WithdrawSuccess
        completed={completedWithdraw}
        onClose={() => setCompletedWithdraw(null)}
      />
    );
  }

  if (variant === "product" && failedWithdraw) {
    return (
      <WithdrawFailure
        message={failureMessage}
        onRetry={() => void onConfirmWithdraw(failedWithdraw)}
        onClose={() => {
          setFailedWithdraw(null);
          setFailureMessage("");
        }}
      />
    );
  }

  if (variant === "lab") {
    return (
      <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
        <h1>출금 기능 테스트</h1>
        <form onSubmit={onSubmit}>
          <p>
            <label>
              출금할 토큰
              <select
                value={token}
                onChange={(event) => onTokenChange(event.target.value as DepositToken)}
                style={labFieldStyle}
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
          </p>
          <p>
            <label>
              출금 네트워크
              <select
                value={network}
                onChange={(event) => setNetwork(event.target.value as DepositNetwork)}
                style={labFieldStyle}
              >
                {networks.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <p>
            <label>
              출금할 주소
              <input
                required
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                style={labFieldStyle}
              />
            </label>
          </p>
          <p>
            <label>
              출금 수량
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(limitWithdrawAmountInput(event.target.value))}
                style={labFieldStyle}
              />
            </label>
          </p>
          <p>현재 잔액: {balanceText} {token}</p>
          <p>예상 수수료: {feeText}</p>
          <button
            type="button"
            onClick={() => void onMaxAmount()}
            disabled={!canQuoteMax || isMaxQuoting || isBalanceLoading}
            style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
          >
            {isMaxQuoting ? "계산 중" : "최대"}
          </button>
          {isUnsupportedSolana && <p role="alert">Solana 출금은 아직 준비 중입니다.</p>}
          {isAmountTooLarge && <p role="alert">잔액이 부족합니다.</p>}
          {isAmountNonPositive && <p role="alert">0보다 큰 수량을 입력해 주세요.</p>}
          {(isFeeShortfall || isArcFeeOverBalance) && <p role="alert">{FEE_USDC_SHORT_MESSAGE}</p>}
          {isKaiaFeeOverBalance && <p role="alert">{FEE_USDT_SHORT_MESSAGE}</p>}
          {error && <p role="alert">{error}</p>}
          {failedWithdraw && (
            <div role="alert">
              <p>전송에 실패했습니다. {failureMessage}</p>
              <button type="button" onClick={() => void onConfirmWithdraw(failedWithdraw)}>
                다시 시도
              </button>
              <button type="button" onClick={() => setFailedWithdraw(null)}>
                닫기
              </button>
            </div>
          )}
          <p>
            <button
              type="submit"
              disabled={
                isUnsupportedSolana ||
                isBalanceLoading ||
                isAmountInvalid ||
                isAmountNonPositive ||
                isAmountTooLarge ||
                isFeeShortfall ||
                isArcFeeOverBalance ||
                isKaiaFeeOverBalance
              }
              style={{ border: "1px solid #444", padding: "0.5rem 0.75rem" }}
            >
              출금 진행
            </button>
          </p>
        </form>
        <p>
          <Link href="/lab">Lab으로 돌아가기</Link>
        </p>
        {pendingWithdraw && (
          <WithdrawConfirmModal
            pending={pendingWithdraw}
            isSending={isSending}
            onConfirm={() => void onConfirmWithdraw()}
            onCancel={() => {
              setPendingWithdraw(null);
              setIsSending(false);
            }}
          />
        )}
        {completedWithdraw && (
          <UsdcCompleteModal
            completed={completedWithdraw}
            onClose={() => setCompletedWithdraw(null)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="wallet-page">
      <div className="wallet-title-row">
        <Link href="/product/transfer" className="wallet-back" aria-label="입출금으로 돌아가기">
          <Image src="/figma/chevron-down.svg" alt="" width={24} height={24} />
        </Link>
        <h1>출금</h1>
      </div>
      <p className="wallet-description">
        내 다른 지갑이나 본인 거래소 계정으로 {token}를 보내요.
      </p>
      <form onSubmit={onSubmit} className="wallet-page" style={{ padding: 0 }}>
        <div className="wallet-field">
          <label htmlFor="withdraw-token">출금할 토큰</label>
          <select
            id="withdraw-token"
            value={token}
            onChange={(event) => onTokenChange(event.target.value as DepositToken)}
          >
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
          </select>
        </div>
        <div className="wallet-field">
          <label htmlFor="withdraw-network">출금할 네트워크</label>
          <select
            id="withdraw-network"
            value={network}
            onChange={(event) => setNetwork(event.target.value as DepositNetwork)}
          >
            {networks.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="wallet-field">
          <label htmlFor="withdraw-recipient">출금할 주소</label>
          <input
            id="withdraw-recipient"
            name="to"
            required
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="받는 주소"
            autoComplete="off"
          />
        </div>
        <div className="wallet-field">
          <label htmlFor="withdraw-amount">출금할 수량</label>
          <input
            id="withdraw-amount"
            name="amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(limitWithdrawAmountInput(event.target.value))}
            placeholder="0.00"
          />
        </div>
        <button
          type="button"
          className="wallet-fee-line wallet-max-button"
          onClick={() => void onMaxAmount()}
          disabled={!canQuoteMax || isMaxQuoting || isBalanceLoading}
        >
          최대 {balanceText} {token}까지 보낼 수 있어요 · 수수료 {feeText}
        </button>
        {isUnsupportedSolana && (
          <p className="wallet-alert" role="alert">
            Solana 출금은 아직 준비 중이에요.
          </p>
        )}
        {isAmountTooLarge && (
          <p className="wallet-alert" role="alert">
            잔액이 부족합니다.
          </p>
        )}
        {isAmountNonPositive && (
          <p className="wallet-alert" role="alert">
            0보다 큰 수량을 입력해 주세요.
          </p>
        )}
        {(isFeeShortfall || isArcFeeOverBalance) && (
          <p className="wallet-alert" role="alert">
            {FEE_USDC_SHORT_MESSAGE}
          </p>
        )}
        {isKaiaFeeOverBalance && (
          <p className="wallet-alert" role="alert">
            {FEE_USDT_SHORT_MESSAGE}
          </p>
        )}
        {error && (
          <p className="wallet-alert" role="alert">
            {error}
          </p>
        )}
        <div className="wallet-warning">
          <span>받는 주소와 네트워크를 다시 확인해 주세요. 잘못 보내면 되찾을 수 없어요.</span>
        </div>
        <button
          type="submit"
          className="wallet-primary-button"
          disabled={
            isUnsupportedSolana ||
            isBalanceLoading ||
            isAmountInvalid ||
            isAmountNonPositive ||
            isAmountTooLarge ||
            isFeeShortfall ||
            isArcFeeOverBalance ||
            isKaiaFeeOverBalance
          }
        >
          출금 진행
        </button>
      </form>
      {pendingWithdraw && (
        <WithdrawConfirmModal
          pending={pendingWithdraw}
          isSending={isSending}
          onConfirm={() => void onConfirmWithdraw()}
          onCancel={() => {
            setPendingWithdraw(null);
            setIsSending(false);
          }}
        />
      )}
    </main>
  );
}

