import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, parseEventLogs, type Hash } from "viem";
import { base } from "viem/chains";
import { getTokenContract } from "@/lib/deposit/token-contracts";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/transactions/current-user";

const AAVE_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const activityAbi = [
  {
    type: "event",
    name: "Supply",
    inputs: [
      { indexed: true, name: "reserve", type: "address" },
      { indexed: false, name: "user", type: "address" },
      { indexed: true, name: "onBehalfOf", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: true, name: "referralCode", type: "uint16" },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { indexed: true, name: "reserve", type: "address" },
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export async function POST(request: Request) {
  try {
    const user = await getCurrentAppUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { type?: string; txHash?: string };
    if (
      (body.type !== "SUPPLY" && body.type !== "REDEEM") ||
      !body.txHash?.match(/^0x[0-9a-fA-F]{64}$/)
    ) {
      return NextResponse.json({ error: "Invalid transaction." }, { status: 400 });
    }

    const usdc = getTokenContract("USDC", "base");
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
    if (!usdc || usdc.kind !== "erc20" || !rpcUrl) throw new Error("Base is not configured.");

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallet_addresses")
      .select("id, address")
      .eq("user_id", user.id)
      .eq("chain_namespace", "eip155:8453")
      .maybeSingle();
    if (walletError) throw walletError;
    if (!wallet) return NextResponse.json({ error: "Base wallet was not registered." }, { status: 409 });

    const hash = body.txHash as Hash;
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const receipt = await client.getTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Transaction was not successful." }, { status: 409 });
    }

    const kernel = wallet.address.toLowerCase();
    const eventName = body.type === "SUPPLY" ? "Supply" : "Withdraw";
    const activity = parseEventLogs({ abi: activityAbi, logs: receipt.logs })
      .find((log) => {
        if (log.address.toLowerCase() !== AAVE_BASE_POOL.toLowerCase() || log.eventName !== eventName) return false;
        if (log.args.reserve.toLowerCase() !== usdc.address.toLowerCase()) return false;
        return log.eventName === "Supply"
          ? log.args.onBehalfOf.toLowerCase() === kernel
          : log.args.user.toLowerCase() === kernel && log.args.to.toLowerCase() === kernel;
      });
    if (!activity) return NextResponse.json({ error: "Aave activity was not found." }, { status: 422 });

    const amount = activity.args.amount;
    const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
    const outgoing = transfers
      .filter(
        (log) =>
          log.address.toLowerCase() === usdc.address.toLowerCase() &&
          log.args.from.toLowerCase() === kernel,
      )
      .reduce((sum, log) => sum + log.args.value, BigInt(0));
    const fee = body.type === "SUPPLY" && outgoing > amount ? outgoing - amount : body.type === "REDEEM" ? outgoing : BigInt(0);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const occurredAt = new Date(Number(block.timestamp) * 1000).toISOString();
    const sender = body.type === "SUPPLY" ? wallet.address : AAVE_BASE_POOL;
    const recipient = body.type === "SUPPLY" ? AAVE_BASE_POOL : wallet.address;
    const eventIndex = activity.logIndex ?? -1;

    const { data: saved, error: activityError } = await supabaseAdmin
      .from("activities")
      .upsert(
        {
          user_id: user.id,
          wallet_address_id: wallet.id,
          type: body.type,
          status: "CONFIRMED",
          idempotency_key: `aave:base:${body.txHash.toLowerCase()}:${body.type}`,
          network: "base",
          chain_namespace: "eip155:8453",
          token_symbol: "USDC",
          token_address: usdc.address,
          amount_raw: amount.toString(),
          token_decimals: usdc.decimals,
          sender_address: sender,
          recipient_address: recipient,
          primary_tx_hash: body.txHash,
          fee_raw: fee.toString(),
          fee_decimals: usdc.decimals,
          fee_symbol: "USDC",
          occurred_at: occurredAt,
          confirmed_at: occurredAt,
          metadata: { product: "Aave Base USDC" },
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
          activity_id: saved.id,
          network: "base",
          chain_namespace: "eip155:8453",
          tx_hash: body.txHash,
          event_index: eventIndex,
          status: "CONFIRMED",
          block_number: receipt.blockNumber.toString(),
          sender_address: sender,
          recipient_address: recipient,
          fee_raw: fee.toString(),
          fee_decimals: usdc.decimals,
          fee_symbol: "USDC",
          occurred_at: occurredAt,
        },
        { onConflict: "chain_namespace,tx_hash,event_index" },
      );
    if (transactionError) throw transactionError;

    return NextResponse.json({ id: saved.id });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Aave transaction could not be recorded." }, { status: 500 });
  }
}
