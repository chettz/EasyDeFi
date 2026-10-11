/**
 * 카이아·kaiaKairos USDT 전송의 Gas Abstraction 예상 수수료
 * 트랜잭션 전송 X. 반환값은 잔액과 같은 6자리 USDT
 *
 * 가스는 KAIA로 내고, 그 KAIA를 USDT 스왑으로 충당한다.
 * 계산은 @kaiachain/web3js-ext gasless와 같다.
 */

import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseEther,
  type Address,
  type Chain,
} from "viem";
import { kaia, kairos } from "viem/chains";
import { getTokenContract } from "../deposit/token-contracts";

const GAS_LIMIT_LEND = BigInt(21000);
export const KAIA_APPROVE_GAS = BigInt(100000);
export const KAIA_SWAP_GAS = BigInt(500000);
const GAS_LIMIT_APPROVE = KAIA_APPROVE_GAS;
const GAS_LIMIT_SWAP = KAIA_SWAP_GAS;
const SLIPPAGE_BPS = BigInt(50);
const BPS = BigInt(10000);

const KAIA_FEE_NETWORKS: Record<"카이아" | "kaiaKairos", { chain: Chain; rpcUrl: string | undefined; router: Address }> = {
  카이아: {
    chain: kaia,
    rpcUrl: process.env.NEXT_PUBLIC_KAIA_RPC_URL,
    router: "0xCf658F786bf4AC62D66d70Dd26B5c1395dA22c63",
  },
  kaiaKairos: {
    chain: kairos,
    rpcUrl: process.env.NEXT_PUBLIC_KAIA_KAIROS_RPC_URL,
    router: "0x4b41783732810b731569E4d944F59372F411BEa2",
  },
};

const routerAbi = [
  {
    name: "commissionRate",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  { // USDT 지원 가능한지 확인
    name: "isTokenSupported",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  { // 필요한 USDT 양 계산
    name: "getAmountIn",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountOut", type: "uint256" },
    ],
    outputs: [{ name: "amountIn", type: "uint256" }],
  },
] as const;

export type KaiaFeeNetwork = keyof typeof KAIA_FEE_NETWORKS;

export function openKaiaClient(network: KaiaFeeNetwork) {
  const config = KAIA_FEE_NETWORKS[network];
  if (!config.rpcUrl) throw new Error(`${network} RPC is not configured.`);
  const token = getTokenContract("USDT", network);
  if (!token || token.kind !== "erc20") throw new Error("Kaia USDT is not configured.");
  const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  return { config, token, client };
}

/**
 * 스왑에 넣을 KAIA·USDT 수량을 견적과 같은 식으로 계산한다.
 */
export async function prepareKaiaSendFee(parameters: {
  network: KaiaFeeNetwork;
  sender: Address;
  recipient: Address;
  amount: bigint;
}) {
  const { config, token, client } = openKaiaClient(parameters.network);

  const supported = await client.readContract({
    address: config.router,
    abi: routerAbi,
    functionName: "isTokenSupported",
    args: [token.address],
  });
  if (!supported) throw new Error(`${parameters.network} USDT is not supported for gas payment.`);

  // 라우터 허용량이 없으면 승인 트랜잭션 가스가 수수료에 포함된다.
  const allowance = await client.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [parameters.sender, config.router],
  });
  const approveRequired = allowance === BigInt(0);

  // KAIA가 없어도 전송 가스 한도만 재기 위해, 견적 호출에서만 잔액이 있는 것처럼 둔다.
  const gas = await client.estimateGas({
    account: parameters.sender,
    to: token.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [parameters.recipient, parameters.amount],
    }),
    stateOverride: [{ address: parameters.sender, balance: parseEther("1") }],
  });
  const gasPrice = await client.getGasPrice();
  const appTxFee = gas * gasPrice;
  const amountRepay =
    gasPrice * (GAS_LIMIT_LEND + (approveRequired ? GAS_LIMIT_APPROVE : BigInt(0)) + GAS_LIMIT_SWAP);

  const commissionRate = await client.readContract({
    address: config.router,
    abi: routerAbi,
    functionName: "commissionRate",
  });
  if (commissionRate >= BPS) throw new Error("Invalid commission rate.");

  // 스왑으로 받아야 하는 KAIA. 상환액과 라우터 수수료, 출금 가스비를 포함한다.
  const minAmountOut = (appTxFee * BPS) / (BPS - commissionRate) + amountRepay;
  const withSlippage = (minAmountOut * (BPS + SLIPPAGE_BPS)) / BPS;

  // 필요한 USDT 양 계산
  const amountIn = await client.readContract({
    address: config.router,
    abi: routerAbi,
    functionName: "getAmountIn",
    args: [token.address, withSlippage], // USDT 주소, KAIA 수량
  });

  return {
    chainId: config.chain.id,
    token: token.address,
    router: config.router,
    approveRequired,
    gasPrice,
    transferGas: gas,
    amountIn,
    minAmountOut,
    amountRepay,
  };
}

/**
 * Privy EOA의 USDT 전송 한 건을 USDT로 낼 때 예상 수수료를 계산한다.
 */
export async function quoteKaiaSendFee(parameters: {
  network: KaiaFeeNetwork;
  sender: Address;
  recipient: Address;
  amount: bigint;
}) {
  const prepared = await prepareKaiaSendFee(parameters);
  return prepared.amountIn;
}
