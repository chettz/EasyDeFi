/**
 * 아크·arcTestnet 네이티브 USDC 전송의 예상 최대 수수료
 * 트랜잭션 전송 X. 반환값은 잔액과 같은 6자리 USDC
 */

import type { Address } from "viem";
import { getRequiredPrefund } from "permissionless/utils";
import type { ArcFeeClient } from "./arc-fee-client";

const NATIVE_USDC_DECIMALS = 18;
const TOKEN_USDC_DECIMALS = 6;
const TOKEN_TO_NATIVE = BigInt(10) ** BigInt(NATIVE_USDC_DECIMALS - TOKEN_USDC_DECIMALS); // 10^12

/**
 * 이미 만들어 둔 Arc Kernel client로 네이티브 USDC 전송 한 건의 예상 최대 수수료 계산
 */
export async function quoteArcSendFee(parameters: {
  client: ArcFeeClient;
  recipient: Address;
  amount: bigint;
}) {
  // 6자리 수량을 네이티브 전송 value인 18자리로 맞춘다.
  const value = parameters.amount * TOKEN_TO_NATIVE;
  // 받는 주소로 value만 보내는 UserOperation을 준비한다. 가스 가격 상한은 client에 들어 있다.
  const userOperation = await parameters.client.smartAccountClient.prepareUserOperation({
    account: parameters.client.account,
    calls: [{ to: parameters.recipient, value }],
  });
  // 가스 한도 합과 maxFeePerGas를 곱한 18자리 USDC를, 잔액과 같은 6자리로 올린다.
  const costInNative = getRequiredPrefund({
    userOperation,
    entryPointVersion: "0.7",
  });
  return (costInNative + TOKEN_TO_NATIVE - BigInt(1)) / TOKEN_TO_NATIVE;
}
