/**
 * 이더리움·sepolia·base·baseSepolia의 ERC-20 페이마스터 Kernel client를 만든다.
 * 이 함수는 전송하지 않는다. 전송은 smartAccountClient.sendTransaction을 호출하는 쪽에서 한다.
 */

import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { prepareUserOperationForErc20Paymaster } from "permissionless/experimental/pimlico";
import { createPublicClient, http, type EIP1193Provider } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";

type EthereumRequest = EIP1193Provider["request"];

const FEE_CHAINS = {
  이더리움: { chain: mainnet, rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL },
  sepolia: { chain: sepolia, rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL },
  base: { chain: base, rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL },
  baseSepolia: { chain: baseSepolia, rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL },
} as const;

function pimlicoUrl(chainId: number) {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (!apiKey) return undefined;
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;
}

export async function createPaymasterFeeClient(
  network: keyof typeof FEE_CHAINS,
  request: EthereumRequest,
) {
  const { chain, rpcUrl } = FEE_CHAINS[network];
  const bundlerUrl = pimlicoUrl(chain.id);
  if (!rpcUrl || !bundlerUrl) {
    console.error(`${network} fee client is not configured.`);
    return undefined;
  }

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const pimlicoClient = createPimlicoClient({
    chain,
    transport: http(bundlerUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });
  const account = await toKernelSmartAccount({
    client: publicClient,
    owners: [{ request: (args) => request(args) }],
    version: "0.3.3",
    index: BigInt(0),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });
  const smartAccountClient = createSmartAccountClient({
    account,
    chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
      prepareUserOperation: prepareUserOperationForErc20Paymaster(pimlicoClient),
    },
  });

  return { smartAccountClient, pimlicoClient, account, publicClient };
}

export type PaymasterFeeClient = NonNullable<Awaited<ReturnType<typeof createPaymasterFeeClient>>>;
