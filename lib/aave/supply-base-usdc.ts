/**
 * Base의 Aave v3 USDC 풀에 Kernel이 USDC를 넣거나 빼는 함수.
 * 가스는 USDC 페이마스터가 낸다.
 */

import { createPublicClient, encodeFunctionData, erc20Abi, http, isAddress, parseEventLogs, type Address, type Hash } from "viem";
import { base } from "viem/chains";
import { getTokenContract } from "../deposit/token-contracts";
import { parseErc20PaymasterFee } from "../parse-erc20-paymaster-fee";
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

// approve와 supply를 출금 수수료 견적과 실제 전송이 같은 호출로 쓰게 만든다.
function supplyCalls(usdc: Address, kernel: Address, amount: bigint) {
  // Pool이 Kernel의 USDC를 가져가려면, Kernel이 그 수량만큼 먼저 허락해야 한다.
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [AAVE_BASE_POOL, amount],
  });
  // asset에 USDC를 넣고, onBehalfOf에 Kernel을 넣으면 aUSDC가 Kernel에게 생긴다.
  // referralCode 0은 추천인 없음이다.
  const supplyData = encodeFunctionData({
    abi: poolAbi,
    functionName: "supply",
    args: [usdc, amount, kernel, 0],
  });
  return [
    { to: usdc, data: approveData },
    { to: AAVE_BASE_POOL, data: supplyData },
  ];
}

// 출금의 quoteTransferFee와 같이, 전송 없이 예상 최대 USDC 수수료만 구한다.
export async function quoteSupplyBaseUsdcFee(parameters: { client: PaymasterFeeClient; amount: bigint }) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  const preview = await parseErc20PaymasterFee({
    token: usdc.address,
    tokenDecimals: usdc.decimals,
    calls: supplyCalls(usdc.address, parameters.client.account.address, parameters.amount),
    prepareUserOperation: (args) =>
      parameters.client.smartAccountClient.prepareUserOperation({
        ...args,
        account: parameters.client.account,
      }),
    estimateErc20PaymasterCost: (args) => parameters.client.pimlicoClient.estimateErc20PaymasterCost(args),
  });
  return preview.costInToken;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// 공급으로 Kernel이 받은 aToken. 민트 Transfer의 수량과 토큰 이름이다.
async function readMintedAToken(parameters: { client: PaymasterFeeClient; hash: Hash; kernel: Address }) {
  const receipt = await parameters.client.publicClient.getTransactionReceipt({ hash: parameters.hash });
  const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
  const kernel = parameters.kernel.toLowerCase();
  // Aave는 공급량만큼 aToken을 0 주소에서 Kernel로 민트한다.
  const minted = transfers.find(
    (log) => log.args.from.toLowerCase() === ZERO_ADDRESS && log.args.to.toLowerCase() === kernel,
  );
  if (!minted) throw new Error("Minted aToken transfer was not found.");

  const [symbol, decimals] = await Promise.all([
    parameters.client.publicClient.readContract({
      address: minted.address,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    parameters.client.publicClient.readContract({
      address: minted.address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  return { amount: minted.args.value, symbol, decimals };
}

// USDC pool supply 호출
export async function supplyBaseUsdc(parameters: { client: PaymasterFeeClient; amount: bigint }) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  // 예치되는 주소. Privy EOA가 아니라 Base 입금용 Kernel이다.
  const kernel: Address = parameters.client.account.address;

  // 두 호출을 하나의 UserOperation으로 보낸다. 서명도 한 번
  const hash = await parameters.client.smartAccountClient.sendTransaction({
    calls: supplyCalls(usdc.address, kernel, parameters.amount),
    paymasterContext: { token: usdc.address },
  });
  // 공급은 이미 끝났다. 받은 토큰을 영수증에서 못 읽어도 공급 실패로 되돌리지 않는다.
  try {
    return await readMintedAToken({ client: parameters.client, hash, kernel });
  } catch (cause) {
    console.error(cause);
    return null;
  }
}

const reserveATokenAbi = [
  {
    name: "getReserveAToken",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// 지갑에 있는 USDC가 아니다. Kernel이 이 풀에서 꺼낼 수 있는 예치 수량을 USDC 단위로 읽는다.
export async function getBaseUsdcWithdrawable(owner: string) {
  const usdc = getTokenContract("USDC", "base");
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
  if (!usdc || usdc.kind !== "erc20" || !isAddress(owner) || !rpcUrl) return undefined;

  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  try {
    // aToken.balanceOf는 이자를 반영한 공급 잔액이고, 단위는 USDC와 같은 소수 6자리다.
    const aToken = await client.readContract({
      address: AAVE_BASE_POOL,
      abi: reserveATokenAbi,
      functionName: "getReserveAToken",
      args: [usdc.address],
    });
    return client.readContract({
      address: aToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
  } catch (cause) {
    console.error(cause);
    return undefined;
  }
}

// 견적과 실제 인출이 같은 withdraw 호출을 쓰게 만든다.
function withdrawCalls(usdc: Address, kernel: Address, amount: bigint) {
  // asset은 빼낼 토큰, amount는 USDC 수량(소수 6자리), to는 받을 주소
  // Kernel이 직접 호출하므로 풀이 Kernel의 aUSDC를 태우고 USDC를 to로 보낸다.
  const withdrawData = encodeFunctionData({
    abi: poolAbi,
    functionName: "withdraw",
    args: [usdc, amount, kernel],
  });
  return [{ to: AAVE_BASE_POOL, data: withdrawData }];
}

// 공급 수수료 견적과 같이, 전송 없이 withdraw 한 건의 예상 최대 USDC 수수료를 구한다.
export async function quoteWithdrawBaseUsdcFee(parameters: { client: PaymasterFeeClient; amount: bigint }) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  const preview = await parseErc20PaymasterFee({
    token: usdc.address,
    tokenDecimals: usdc.decimals,
    calls: withdrawCalls(usdc.address, parameters.client.account.address, parameters.amount),
    prepareUserOperation: (args) =>
      parameters.client.smartAccountClient.prepareUserOperation({
        ...args,
        account: parameters.client.account,
      }),
    estimateErc20PaymasterCost: (args) => parameters.client.pimlicoClient.estimateErc20PaymasterCost(args),
  });
  return preview.costInToken;
}

// 인출로 Kernel이 받은 USDC. 수수료는 Kernel이 보낸 전송이라 여기서 빠진다.
async function readWithdrawnUsdc(parameters: {
  client: PaymasterFeeClient;
  hash: Hash;
  usdc: Address;
  kernel: Address;
}) {
  const receipt = await parameters.client.publicClient.getTransactionReceipt({ hash: parameters.hash });
  const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
  const kernel = parameters.kernel.toLowerCase();
  const usdc = parameters.usdc.toLowerCase();
  const received = transfers.filter(
    (log) => log.address.toLowerCase() === usdc && log.args.to.toLowerCase() === kernel,
  );
  if (received.length === 0) throw new Error("Withdrawn USDC transfer was not found.");
  return received.reduce((sum, log) => sum + log.args.value, BigInt(0));
}

// USDC pool withdraw 호출.
export async function withdrawBaseUsdc(parameters: { client: PaymasterFeeClient; amount: bigint }) {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  // USDC를 돌려받을 주소. 예치 기록도 Kernel에 있으므로 여기로 받는다.
  const kernel: Address = parameters.client.account.address;

  // 가스비로 쓸 USDC는 인출 전에 Kernel 지갑에 남아 있어야 한다.
  const hash = await parameters.client.smartAccountClient.sendTransaction({
    calls: withdrawCalls(usdc.address, kernel, parameters.amount),
    paymasterContext: { token: usdc.address },
  });
  // 인출은 이미 끝났다. 받은 수량을 영수증에서 못 읽어도 인출 실패로 되돌리지 않는다.
  try {
    return await readWithdrawnUsdc({ client: parameters.client, hash, usdc: usdc.address, kernel });
  } catch (cause) {
    console.error(cause);
    return null;
  }
}
