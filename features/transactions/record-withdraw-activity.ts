import type { Hash } from "viem";
import { recordOrQueueActivity } from "@/features/transactions/pending-activities";
import type { DepositNetwork, DepositToken } from "@/lib/deposit/networks";

export async function recordWithdrawActivity(
  transaction: {
    network: DepositNetwork;
    token: DepositToken;
    txHash: Hash;
    recipient: string;
    amount: bigint;
    feeTxHash?: Hash;
  },
  getAccessToken: () => Promise<string | null>,
) {
  return recordOrQueueActivity(
    {
      id: `withdraw:${transaction.network}:${transaction.token}:${transaction.txHash.toLowerCase()}`,
      kind: "withdraw",
      network: transaction.network,
      token: transaction.token,
      txHash: transaction.txHash,
      feeTxHash: transaction.feeTxHash,
      recipient: transaction.recipient,
      amountRaw: transaction.amount.toString(),
    },
    getAccessToken,
  );
}
