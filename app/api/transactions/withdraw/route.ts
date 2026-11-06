import { NextResponse } from "next/server";
import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  parseEventLogs,
  type Address,
  type Chain,
  type Hash,
} from "viem";
import { arc, arcTestnet, base, baseSepolia, kaia, kairos, mainnet, sepolia } from "viem/chains";
import { getTokenContract } from "@/lib/deposit/token-contracts";
import type { DepositNetwork, DepositToken } from "@/lib/deposit/networks";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/transactions/current-user";

type WithdrawNetwork = "이더리움" | "sepolia" | "카이아" | "kaiaKairos" | "아크" | "arcTestnet" | "base" | "baseSepolia";
const NETWORKS: Record<
  WithdrawNetwork,
  { chain: Chain; rpcUrl: string | undefined; kind: "PAYMASTER" | "ARC" | "KAIA"; router?: Address }
> = {
  이더리움: { chain: mainnet, rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL, kind: "PAYMASTER" },
  sepolia: { chain: sepolia, rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL, kind: "PAYMASTER" },
  카이아: {
    chain: kaia,
    rpcUrl: process.env.NEXT_PUBLIC_KAIA_RPC_URL,
    kind: "KAIA",
    router: "0xCf658F786bf4AC62D66d70Dd26B5c1395dA22c63",
  },
  kaiaKairos: {
    chain: kairos,
    rpcUrl: process.env.NEXT_PUBLIC_KAIA_KAIROS_RPC_URL,
    kind: "KAIA",
    router: "0x4b41783732810b731569E4d944F59372F411BEa2",
  },
  아크: { chain: arc, rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL, kind: "ARC" },
  arcTestnet: { chain: arcTestnet, rpcUrl: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL, kind: "ARC" },
  base: { chain: base, rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL, kind: "PAYMASTER" },
  baseSepolia: { chain: baseSepolia, rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL, kind: "PAYMASTER" },
};
const userOperationEvent = {
  type: "event",
  name: "UserOperationEvent",
  inputs: [
    { name: "userOpHash", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "paymaster", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: false },
    { name: "success", type: "bool", indexed: false },
    { name: "actualGasCost", type: "uint256", indexed: false },
    { name: "actualGasUsed", type: "uint256", indexed: false },
  ],
} as const;
const swapForGasAbi = [{
  name: "swapForGas",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [
    { name: "token", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "amountRepay", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
}] as const;
const HASH = /^0x[0-9a-fA-F]{64}$/;

function isWithdrawNetwork(value: string): value is WithdrawNetwork {
  return value in NETWORKS;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentAppUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      network?: string;
      token?: string;
      txHash?: string;
      feeTxHash?: string;
      recipient?: string;
      amountRaw?: string;
    };
    if (
      !body.network ||
      !isWithdrawNetwork(body.network) ||
      (body.token !== "USDC" && body.token !== "USDT") ||
      !body.txHash?.match(HASH) ||
      !body.recipient ||
      !isAddress(body.recipient) ||
      !body.amountRaw?.match(/^\d+$/)
    ) {
      return NextResponse.json({ error: "Invalid transaction." }, { status: 400 });
    }

    const network = body.network as DepositNetwork;
    const tokenName = body.token as DepositToken;
    const config = NETWORKS[body.network];
    const token = getTokenContract(tokenName, network);
    if (!token || token.kind !== "erc20" || !config.rpcUrl) {
      return NextResponse.json({ error: "Network is not configured." }, { status: 409 });
    }
    if ((config.kind === "ARC" && tokenName !== "USDC") || (config.kind === "KAIA" && tokenName !== "USDT")) {
      return NextResponse.json({ error: "Token is not supported on this network." }, { status: 400 });
    }

    const chainNamespace = `eip155:${config.chain.id}`;
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("id, address")
      .eq("user_id", user.id)
      .eq("chain_namespace", chainNamespace)
      .maybeSingle();
    if (walletError) throw walletError;
    if (!wallet) return NextResponse.json({ error: "Wallet was not registered." }, { status: 409 });

    const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
    const txHash = body.txHash as Hash;
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Transaction was not successful." }, { status: 409 });
    }

    const sender = wallet.address.toLowerCase();
    let amount = BigInt(body.amountRaw);
    let fee = BigInt(0);
    let eventIndex = -1;
    let feeHash: Hash | null = null;
    const childTransactions: {
      activity_id?: string;
      network: string;
      chain_namespace: string;
      tx_hash: string;
      event_index: number;
      status: "CONFIRMED";
      block_number: string;
      sender_address: string;
      recipient_address: string;
      fee_raw: string;
      fee_decimals: number;
      fee_symbol: string;
      occurred_at: string;
      metadata?: object;
    }[] = [];

    if (config.kind === "ARC") {
      const event = parseEventLogs({
        abi: [userOperationEvent],
        logs: receipt.logs,
        eventName: "UserOperationEvent",
      }).find((log) => log.args.sender.toLowerCase() === sender && log.args.success);
      if (!event) return NextResponse.json({ error: "Arc transfer was not found." }, { status: 422 });
      const scale = BigInt(10) ** BigInt(12);
      fee = (event.args.actualGasCost + scale - BigInt(1)) / scale;
      eventIndex = event.logIndex ?? -1;
    } else {
      const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
      const principal = transfers.find(
        (log) =>
          log.address.toLowerCase() === token.address.toLowerCase() &&
          log.args.from.toLowerCase() === sender &&
          log.args.to.toLowerCase() === body.recipient!.toLowerCase() &&
          log.args.value === amount,
      );
      if (!principal) return NextResponse.json({ error: "Token transfer was not found." }, { status: 422 });
      amount = principal.args.value;
      eventIndex = principal.logIndex ?? -1;

      if (config.kind === "PAYMASTER") {
        fee = transfers
          .filter(
            (log) =>
              log.address.toLowerCase() === token.address.toLowerCase() &&
              log.args.from.toLowerCase() === sender &&
              log.logIndex !== principal.logIndex,
          )
          .reduce((sum, log) => sum + log.args.value, BigInt(0));
      } else {
        if (!body.feeTxHash?.match(HASH) || !config.router) {
          return NextResponse.json({ error: "Kaia fee transaction is missing." }, { status: 422 });
        }
        feeHash = body.feeTxHash as Hash;
        const [feeReceipt, feeTransaction] = await Promise.all([
          client.getTransactionReceipt({ hash: feeHash }),
          client.getTransaction({ hash: feeHash }),
        ]);
        if (
          feeReceipt.status !== "success" ||
          feeTransaction.from.toLowerCase() !== sender ||
          feeTransaction.to?.toLowerCase() !== config.router.toLowerCase()
        ) {
          return NextResponse.json({ error: "Kaia fee transaction was not valid." }, { status: 422 });
        }
        const decoded = decodeFunctionData({ abi: swapForGasAbi, data: feeTransaction.input });
        fee = decoded.args[1];
        childTransactions.push({
          network,
          chain_namespace: chainNamespace,
          tx_hash: feeHash,
          event_index: -1,
          status: "CONFIRMED",
          block_number: feeReceipt.blockNumber.toString(),
          sender_address: wallet.address,
          recipient_address: config.router,
          fee_raw: fee.toString(),
          fee_decimals: token.decimals,
          fee_symbol: tokenName,
          occurred_at: "",
          metadata: { role: "fee_swap" },
        });
      }
    }

    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const occurredAt = new Date(Number(block.timestamp) * 1000).toISOString();
    const { data: saved, error: activityError } = await supabaseAdmin
      .from("activities")
      .upsert(
        {
          user_id: user.id,
          wallet_address_id: wallet.id,
          type: "WITHDRAW",
          status: "CONFIRMED",
          idempotency_key: `withdraw:${chainNamespace}:${body.txHash.toLowerCase()}:${tokenName}`,
          network,
          chain_namespace: chainNamespace,
          token_symbol: tokenName,
          token_address: token.address,
          amount_raw: amount.toString(),
          token_decimals: token.decimals,
          sender_address: wallet.address,
          recipient_address: body.recipient,
          primary_tx_hash: body.txHash,
          fee_raw: fee.toString(),
          fee_decimals: token.decimals,
          fee_symbol: tokenName,
          occurred_at: occurredAt,
          confirmed_at: occurredAt,
          metadata: feeHash ? { fee_tx_hash: feeHash } : {},
        },
        { onConflict: "idempotency_key" },
      )
      .select("id")
      .single();
    if (activityError) throw activityError;

    childTransactions.unshift({
      activity_id: saved.id,
      network,
      chain_namespace: chainNamespace,
      tx_hash: body.txHash,
      event_index: eventIndex,
      status: "CONFIRMED",
      block_number: receipt.blockNumber.toString(),
      sender_address: wallet.address,
      recipient_address: body.recipient,
      fee_raw: fee.toString(),
      fee_decimals: token.decimals,
      fee_symbol: tokenName,
      occurred_at: occurredAt,
    });
    for (const transaction of childTransactions) {
      transaction.activity_id = saved.id;
      if (!transaction.occurred_at) transaction.occurred_at = occurredAt;
    }
    const { error: transactionError } = await supabaseAdmin
      .from("activity_transactions")
      .upsert(childTransactions, { onConflict: "chain_namespace,tx_hash,event_index" });
    if (transactionError) throw transactionError;

    return NextResponse.json({ id: saved.id });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Withdraw transaction could not be recorded." }, { status: 500 });
  }
}
