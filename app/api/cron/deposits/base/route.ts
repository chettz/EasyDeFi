import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { getTokenContract } from "@/lib/deposit/token-contracts";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  BASE_DEPOSIT_NETWORKS,
  recordBaseUsdcDeposit,
  type BaseDepositNetwork,
} from "@/lib/transactions/base-usdc-deposit";

export const runtime = "nodejs";

const INITIAL_LOOKBACK = BigInt(50_000);
const REORG_OVERLAP = BigInt(20);
const BLOCK_BATCH = BigInt(2_000);
const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
} as const;

function startBlock(cursor: string | null, end: bigint) {
  if (!cursor) return end > INITIAL_LOOKBACK ? end - INITIAL_LOOKBACK : BigInt(0);
  const parsed = BigInt(cursor);
  return parsed >= REORG_OVERLAP ? parsed - REORG_OVERLAP + BigInt(1) : BigInt(0);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary: Record<string, { wallets: number; recorded: number; cursor: string }> = {};

    for (const network of Object.keys(BASE_DEPOSIT_NETWORKS) as BaseDepositNetwork[]) {
      const config = BASE_DEPOSIT_NETWORKS[network];
      const usdc = getTokenContract("USDC", config.network);
      if (!usdc || usdc.kind !== "erc20" || !config.rpcUrl) {
        throw new Error(`${config.network} USDC is not configured.`);
      }

      const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
      const head = await client.getBlockNumber();
      const end = head > config.confirmations ? head - config.confirmations : BigInt(0);
      const { data: wallets, error: walletError } = await supabaseAdmin
        .from("wallet_addresses")
        .select("id, address, last_synced_cursor")
        .eq("chain_namespace", config.chainNamespace);
      if (walletError) throw walletError;

      let recorded = 0;
      for (const wallet of wallets ?? []) {
        let fromBlock = startBlock(wallet.last_synced_cursor, end);
        while (fromBlock <= end) {
          const toBlock = fromBlock + BLOCK_BATCH - BigInt(1) < end
            ? fromBlock + BLOCK_BATCH - BigInt(1)
            : end;
          const logs = await client.getLogs({
            address: usdc.address,
            event: transferEvent,
            args: { to: wallet.address as Address },
            fromBlock,
            toBlock,
          });
          for (const log of logs) {
            if (!log.transactionHash || log.args.value === undefined) continue;
            const saved = await recordBaseUsdcDeposit({
              network,
              hash: log.transactionHash,
              recipient: wallet.address,
              expectedRaw: log.args.value,
              expectedLogIndex: log.logIndex ?? undefined,
              source: "cursor_reconciliation",
            });
            if (saved) recorded += 1;
          }
          fromBlock = toBlock + BigInt(1);
        }

        const { error: cursorError } = await supabaseAdmin
          .from("wallet_addresses")
          .update({ last_synced_cursor: end.toString() })
          .eq("id", wallet.id);
        if (cursorError) throw cursorError;
      }

      summary[config.network] = {
        wallets: wallets?.length ?? 0,
        recorded,
        cursor: end.toString(),
      };
    }

    return NextResponse.json({ networks: summary });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "Deposit reconciliation failed." }, { status: 500 });
  }
}
