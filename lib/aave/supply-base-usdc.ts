/**
 * Base의 Aave v3 USDC 풀에 Kernel이 USDC를 넣거나 빼는 함수.
 * 가스는 USDC 페이마스터가 낸다.
 */

import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { getTokenContract } from "../deposit/token-contracts";
import type { PaymasterFeeClient } from "../paymaster/fee-client";

// Aave v3 Base 마켓의 Pool 계약. supply를 호출하면 이 계약이 USDC를 가져간다.
const AAVE_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as const;

const poolAbi = [
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// USDC pool supply 호출
export async function supplyBaseUsdc(parameters: { client: PaymasterFeeClient; amount: bigint }) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  // 예치되는 주소. Privy EOA가 아니라 Base 입금용 Kernel이다.
  const kernel: Address = parameters.client.account.address;

  // Pool이 Kernel의 USDC를 가져가려면, Kernel이 그 수량만큼 먼저 허락해야 한다.
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [AAVE_BASE_POOL, parameters.amount],
  });
  // asset에 USDC를 넣고, onBehalfOf에 Kernel을 넣으면 aUSDC가 Kernel에게 생긴다.
  // referralCode 0은 추천인 없음이다.
  const supplyData = encodeFunctionData({
    abi: poolAbi,
    functionName: "supply",
    args: [usdc.address, parameters.amount, kernel, 0],
  });

  // 두 호출을 하나의 UserOperation으로 보낸다. 서명도 한 번
  await parameters.client.smartAccountClient.sendTransaction({
    calls: [
      { to: usdc.address, data: approveData },
      { to: AAVE_BASE_POOL, data: supplyData },
    ],
    paymasterContext: { token: usdc.address },
  });
}

// USDC pool withdraw 호출.
export async function withdrawBaseUsdc(parameters: { client: PaymasterFeeClient; amount: bigint }) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  // USDC를 돌려받을 주소. 예치 기록도 Kernel에 있으므로 여기로 받는다.
  const kernel: Address = parameters.client.account.address;

  // asset은 빼낼 토큰, amount는 USDC 수량(소수 6자리), to는 받을 주소
  // Kernel이 직접 호출하므로 풀이 Kernel의 aUSDC를 태우고 USDC를 to로 보낸다.
  const withdrawData = encodeFunctionData({
    abi: poolAbi,
    functionName: "withdraw",
    args: [usdc.address, parameters.amount, kernel],
  });

  // 가스비로 쓸 USDC는 인출 전에 Kernel 지갑에 남아 있어야 한다.
  await parameters.client.smartAccountClient.sendTransaction({
    calls: [{ to: AAVE_BASE_POOL, data: withdrawData }],
    paymasterContext: { token: usdc.address },
  });
}
