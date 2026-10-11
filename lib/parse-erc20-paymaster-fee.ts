import { formatUnits, type Address, type Hex } from "viem";
import type { UserOperation } from "viem/account-abstraction";

/**
 * 제출 전 UserOperation으로 ERC-20 paymaster 예상 최대 수수료를 계산
 * 실제 트랜잭션 전송은 하지 않음
 */

export type Erc20PaymasterCall = {
  to: Address;
  value?: bigint;
  data?: Hex;
};

export type Erc20PaymasterFeePreview = {
  costInToken: bigint; // 토큰 최소 단위의 예상 최대 수수료
  costInUsd: bigint; // 항상 6 decimals인 예상 최대 USD 수수료
  humanReadableCostInToken : string;
  humanReadableUsdAmount: string;
};

type PrepareErc20PaymasterUserOperation = (args: {
  calls: Erc20PaymasterCall[];
  paymasterContext: { token: Address };
}) => Promise<UserOperation<"0.7">>;

type EstimateErc20PaymasterCost = (args: {
  userOperation: UserOperation<"0.7">;
  token: Address;
}) => Promise<{
  costInToken: bigint;
  costInUsd: bigint;
}>;

export async function parseErc20PaymasterFee(parameters: {
  prepareUserOperation: PrepareErc20PaymasterUserOperation;
  estimateErc20PaymasterCost: EstimateErc20PaymasterCost;
  token: Address;
  tokenDecimals: number;
  calls: Erc20PaymasterCall[];
}): Promise<Erc20PaymasterFeePreview> {
  // 최소 승인(approve) 호출이 포함된 UserOperation을 만든 뒤 그 비용을 계산, 실제 전송 X
  // userOp 준비(approve 호출 포함)
  const userOperation = await parameters.prepareUserOperation({
    //args
    calls: parameters.calls, // 사용자가 전송하려는 호출
    paymasterContext: { token: parameters.token },
  });
  // userOp 비용 계산
  const { costInToken, costInUsd } = await parameters.estimateErc20PaymasterCost({
    userOperation,
    token: parameters.token,
  });

  return {
    costInToken,
    costInUsd,
    humanReadableCostInToken : formatUnits(costInToken, parameters.tokenDecimals),
    humanReadableUsdAmount: formatUnits(costInUsd, 6),
  };
}
