import "server-only";

import {
  createPublicClient,
  erc20Abi,
  http,
  parseEventLogs,
  type Hash,
} from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import type { DepositToken } from "@/lib/deposit/networks";
import { getTokenContract } from "@/lib/deposit/token-contracts";
import { supabaseAdmin } from "@/lib/supabase/server";

export const EVM_DEPOSIT_NETWORKS = {
  ETH_MAINNET: {
    network: "이더리움",
    chainNamespace: "eip155:1",
    chain: mainnet,
    rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
    aavePool: null,
    confirmations: BigInt(12),
    tokens: ["USDC", "USDT"] as const,
  },
  ETH_SEPOLIA: {
    network: "sepolia",
    chainNamespace: "eip155:11155111",
    chain: sepolia,
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
    aavePool: null,
    confirmations: BigInt(5),
    tokens: ["USDC"] as const,
  },
  BASE_MAINNET: {
    network: "base",
    chainNamespace: "eip155:8453",
    chain: base,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL,
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    confirmations: BigInt(20),
    tokens: ["USDC"] as const,
  },
  BASE_SEPOLIA: {
    network: "baseSepolia",
    chainNamespace: "eip155:84532",
    chain: baseSepolia,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    aavePool: null,
    confirmations: BigInt(5),
    tokens: ["USDC"] as const,
  },
} as const;

export const BASE_DEPOSIT_NETWORKS = {
  BASE_MAINNET: EVM_DEPOSIT_NETWORKS.BASE_MAINNET,
  BASE_SEPOLIA: EVM_DEPOSIT_NETWORKS.BASE_SEPOLIA,
} as const;

const aaveWithdrawEvent = {
  type: "event",
  name: "Withdraw",
  inputs: [
    { indexed: true, name: "reserve", type: "address" },
    { indexed: true, name: "user", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
  ],
} as const;

export type BaseDepositNetwork = keyof typeof BASE_DEPOSIT_NETWORKS;
export type EvmDepositNetwork = keyof typeof EVM_DEPOSIT_NETWORKS;

export async function recordEvmTokenDeposit(parameters: {
  network: EvmDepositNetwork;
  token: DepositToken;
  hash: Hash;
  recipient: string;
  expectedRaw?: bigint;
  expectedLogIndex?: number;
  source: "alchemy_address_activity" | "cursor_reconciliation";
}) {
  const config = EVM_DEPOSIT_NETWORKS[parameters.network];
  if (!(config.tokens as readonly string[]).includes(parameters.token)) {
    throw new Error(`${parameters.token} is not supported on ${config.network}.`);
  }
  const token = getTokenContract(parameters.token, config.network);
  if (!token || token.kind !== "erc20" || !config.rpcUrl) {
    throw new Error(`${config.network} ${parameters.token} is not configured.`);
  }

  const recipient = parameters.recipient.toLowerCase();
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from("wallet_addresses")
    .select("id, user_id, address")
    .eq("chain_namespace", config.chainNamespace)
    .eq("address_normalized", recipient)
    .maybeSingle();
  if (walletError) throw walletError;
  if (!wallet) return false;

  const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: parameters.hash });
  if (receipt.status !== "success") return false;

  const protocolWithdraw =
    config.aavePool !== null &&
    parseEventLogs({
      abi: [aaveWithdrawEvent],
      logs: receipt.logs,
      eventName: "Withdraw",
    }).some(
      (log) =>
        log.address.toLowerCase() === config.aavePool.toLowerCase() &&
        log.args.reserve.toLowerCase() === token.address.toLowerCase() &&
        log.args.to.toLowerCase() === recipient,
    );
  if (protocolWithdraw) return false;

  const transfer = parseEventLogs({
    abi: erc20Abi,
    logs: receipt.logs,
    eventName: "Transfer",
  }).find(
    (log) =>
      log.address.toLowerCase() === token.address.toLowerCase() &&
      log.args.to.toLowerCase() === recipient &&
      (parameters.expectedRaw === undefined || log.args.value === parameters.expectedRaw) &&
      (parameters.expectedLogIndex === undefined || log.logIndex === parameters.expectedLogIndex),
  );
  if (!transfer) return false;

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const occurredAt = new Date(Number(block.timestamp) * 1000).toISOString();
  const fee = receipt.gasUsed * (receipt.effectiveGasPrice ?? BigInt(0));
  const eventIndex = transfer.logIndex ?? -1;
  const { data: activity, error: activityError } = await supabaseAdmin
    .from("activities")
    .upsert(
      {
        user_id: wallet.user_id,
        wallet_address_id: wallet.id,
        type: "DEPOSIT",
        status: "CONFIRMED",
        idempotency_key: `deposit:${config.chainNamespace}:${parameters.hash.toLowerCase()}:${eventIndex}`,
        network: config.network,
        chain_namespace: config.chainNamespace,
        token_symbol: parameters.token,
        token_address: token.address,
        amount_raw: transfer.args.value.toString(),
        token_decimals: token.decimals,
        sender_address: transfer.args.from,
        recipient_address: wallet.address,
        primary_tx_hash: parameters.hash,
        fee_raw: fee.toString(),
        fee_decimals: 18,
        fee_symbol: "ETH",
        occurred_at: occurredAt,
        confirmed_at: occurredAt,
        metadata: { source: parameters.source, alchemy_network: parameters.network },
      },
      { onConflict: "idempotency_key" },
    )
    .select("id")
    .single();
  if (activityError) throw activityError;

  const { error: transactionError } = await supabaseAdmin
    .from("activity_transactions")
    .upsert(
      {
        activity_id: activity.id,
        network: config.network,
        chain_namespace: config.chainNamespace,
        tx_hash: parameters.hash,
        event_index: eventIndex,
        status: "CONFIRMED",
        block_number: receipt.blockNumber.toString(),
        sender_address: transfer.args.from,
        recipient_address: wallet.address,
        fee_raw: fee.toString(),
        fee_decimals: 18,
        fee_symbol: "ETH",
        occurred_at: occurredAt,
      },
      { onConflict: "chain_namespace,tx_hash,event_index" },
    );
  if (transactionError) throw transactionError;
  return true;
}

export function recordBaseUsdcDeposit(
  parameters: Omit<Parameters<typeof recordEvmTokenDeposit>[0], "network" | "token"> & {
    network: BaseDepositNetwork;
  },
) {
  return recordEvmTokenDeposit({ ...parameters, token: "USDC" });
}
