/**
 * 아크·arcTestnet에서 Kernel client로 네이티브 USDC를 보낸다.
 * 수량은 잔액과 같은 6자리다. 영수증의 actualGasCost를 6자리 USDC로 올린다.
 */

import { parseEventLogs, type Address, type Hash } from "viem";
import type { ArcFeeClient } from "./arc-fee-client";

const TOKEN_TO_NATIVE = BigInt(10) ** BigInt(12);

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

export async function sendArcTransfer(parameters: {
  client: ArcFeeClient;
  recipient: Address;
  amount: bigint;
}) {
  // 6자리 수량을 네이티브 전송 value인 18자리로 맞춘다.
  const value = parameters.amount * TOKEN_TO_NATIVE;
  const hash = await parameters.client.smartAccountClient.sendTransaction({
    calls: [{ to: parameters.recipient, value }],
  });

  let gas: bigint | null = null;
  try {
    gas = await readArcGas({ client: parameters.client, hash });
  } catch (cause) {
    console.error(cause);
  }
  return { hash, gas };
}

async function readArcGas(parameters: { client: ArcFeeClient; hash: Hash }) {
  const receipt = await parameters.client.publicClient.getTransactionReceipt({ hash: parameters.hash });
  const sender = parameters.client.account.address.toLowerCase();
  const events = parseEventLogs({
    abi: [userOperationEvent],
    logs: receipt.logs,
    eventName: "UserOperationEvent",
  });
  const mine = events.filter((log) => log.args.sender.toLowerCase() === sender);
  if (mine.length === 0) return null;
  const costInNative = mine.reduce((sum, log) => sum + log.args.actualGasCost, BigInt(0));
  return (costInNative + TOKEN_TO_NATIVE - BigInt(1)) / TOKEN_TO_NATIVE;
}
