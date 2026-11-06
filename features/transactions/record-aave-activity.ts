import type { Hash } from "viem";
import { recordOrQueueActivity } from "@/features/transactions/pending-activities";

export async function recordAaveActivity(
  type: "SUPPLY" | "REDEEM",
  txHash: Hash,
  getAccessToken: () => Promise<string | null>,
) {
  return recordOrQueueActivity(
    {
      id: `aave:${type}:${txHash.toLowerCase()}`,
      kind: "aave",
      type,
      txHash,
    },
    getAccessToken,
  );
}
