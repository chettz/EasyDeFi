import type { Hash } from "viem";
import type { DepositNetwork, DepositToken } from "@/lib/deposit/networks";

const STORAGE_KEY = "easydefi:pending-activities:v1";

export type PendingActivity =
  | {
      id: string;
      kind: "aave";
      type: "SUPPLY" | "REDEEM";
      txHash: Hash;
    }
  | {
      id: string;
      kind: "withdraw";
      network: DepositNetwork;
      token: DepositToken;
      txHash: Hash;
      recipient: string;
      amountRaw: string;
      feeTxHash?: Hash;
    };

function readQueue(): PendingActivity[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as PendingActivity[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingActivity[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

function enqueue(activity: PendingActivity) {
  const queue = readQueue();
  if (!queue.some((item) => item.id === activity.id)) writeQueue([...queue, activity]);
}

function remove(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

async function postActivity(activity: PendingActivity, token: string) {
  const endpoint =
    activity.kind === "aave"
      ? "/api/transactions/aave"
      : "/api/transactions/withdraw";
  const body =
    activity.kind === "aave"
      ? { type: activity.type, txHash: activity.txHash }
      : {
          network: activity.network,
          token: activity.token,
          txHash: activity.txHash,
          feeTxHash: activity.feeTxHash,
          recipient: activity.recipient,
          amountRaw: activity.amountRaw,
        };
  return fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function recordOrQueueActivity(
  activity: PendingActivity,
  getAccessToken: () => Promise<string | null>,
) {
  enqueue(activity);
  const token = await getAccessToken();
  if (!token) throw new Error("Privy access token was not returned.");

  const response = await postActivity(activity, token);
  if (!response.ok) throw new Error(`Activity record failed: ${response.status}`);
  remove(activity.id);
}

let flushing = false;

export async function flushPendingActivities(getAccessToken: () => Promise<string | null>) {
  if (flushing) return;
  flushing = true;
  try {
    const token = await getAccessToken();
    if (!token) return;

    for (const activity of readQueue()) {
      try {
        const response = await postActivity(activity, token);
        if (response.ok || response.status === 400 || response.status === 422) {
          remove(activity.id);
        }
      } catch (cause) {
        console.error(cause);
      }
    }
  } finally {
    flushing = false;
  }
}
