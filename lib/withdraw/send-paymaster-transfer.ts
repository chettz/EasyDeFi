/**
 * 이더리움·sepolia·base·baseSepolia에서 페이마스터 Kernel client로 ERC-20을 보낸다.
 * 영수증에서 받는 사람에게 간 전송을 뺀 나머지가 실제 토큰 수수료다.
 */

import { encodeFunctionData, erc20Abi, parseEventLogs, type Address, type Hash } from "viem";
import type { PaymasterFeeClient } from "../paymaster/fee-client";

export async function sendPaymasterTransfer(parameters: {
  client: PaymasterFeeClient;
  token: Address;
  recipient: Address;
  amount: bigint;
}) {
  // transfer 호출 데이터. 호출 대상은 받는 주소가 아니라 토큰 계약이다.
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [parameters.recipient, parameters.amount],
  });
  const hash = await parameters.client.smartAccountClient.sendTransaction({
    calls: [{ to: parameters.token, data }],
    paymasterContext: { token: parameters.token },
  });

  let gas: bigint | null = null;
  try {
    gas = await readPaymasterTokenGas({
      client: parameters.client,
      hash,
      token: parameters.token,
      recipient: parameters.recipient,
      amount: parameters.amount,
    });
  } catch (cause) {
    console.error(cause);
  }
  return { hash, gas };
}

async function readPaymasterTokenGas(parameters: {
  client: PaymasterFeeClient;
  hash: Hash;
  token: Address;
  recipient: Address;
  amount: bigint;
}) {
  const receipt = await parameters.client.publicClient.getTransactionReceipt({ hash: parameters.hash });
  const sender = parameters.client.account.address.toLowerCase();
  const transfers = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, eventName: "Transfer" });
  const outgoing = transfers.filter(
    (log) => log.address.toLowerCase() === parameters.token.toLowerCase() && log.args.from.toLowerCase() === sender,
  );
  const gasLogs = outgoing.filter(
    (log) =>
      !(log.args.to.toLowerCase() === parameters.recipient.toLowerCase() && log.args.value === parameters.amount),
  );
  if (gasLogs.length === 0) return null;
  return gasLogs.reduce((sum, log) => sum + log.args.value, BigInt(0));
}
