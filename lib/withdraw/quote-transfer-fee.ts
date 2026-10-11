/**
 * 출금 수량 확인과 최대 버튼이 함께 쓰는 ERC-20 transfer 수수료 견적
 * 트랜잭션 전송 X
 */

import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { parseErc20PaymasterFee } from "../parse-erc20-paymaster-fee";
import type { PaymasterFeeClient } from "../paymaster/fee-client";

/**
 * 이미 만들어 둔 Kernel client로 transfer 한 건의 예상 최대 수수료를 구한다.
 * 반환값은 토큰 최소 단위
 */
export async function quoteTransferFee(parameters: {
  client: PaymasterFeeClient;
  token: Address;
  tokenDecimals: number;
  recipient: Address;
  amount: bigint;
}) {
  // transfer 호출 데이터 생성
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [parameters.recipient, parameters.amount],
  });
  // UserOperation을 준비한 뒤, 그 가스 한도를 토큰 수수료로 전환
  const preview = await parseErc20PaymasterFee({
    token: parameters.token,
    tokenDecimals: parameters.tokenDecimals,
    calls: [{ to: parameters.token, data }],
    prepareUserOperation: (args) =>
      parameters.client.smartAccountClient.prepareUserOperation({
        ...args,
        account: parameters.client.account,
      }),
    estimateErc20PaymasterCost: (args) => parameters.client.pimlicoClient.estimateErc20PaymasterCost(args),
  });
  return preview.costInToken;
}
