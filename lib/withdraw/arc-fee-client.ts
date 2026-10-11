/**
 * 아크·arcTestnet의 네이티브 USDC Kernel client를 만든다.
 * 이 함수는 전송하지 않는다. 전송은 smartAccountClient.sendTransaction을 호출하는 쪽에서 한다.
 * ERC-20 paymaster는 쓰지 않는다.
 */

import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, parseGwei, type EIP1193Provider } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { arc, arcTestnet } from "viem/chains";

type EthereumRequest = EIP1193Provider["request"];

const ARC_FEE_CHAINS = {
  아크: { chain: arc, rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL },
  arcTestnet: { chain: arcTestnet, rpcUrl: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL },
} as const;

const MIN_MAX_FEE_PER_GAS = parseGwei("20");

function pimlicoUrl(chainId: number) {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (!apiKey) return undefined;
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;
}

export async function createArcFeeClient(network: keyof typeof ARC_FEE_CHAINS, request: EthereumRequest) {
  const { chain, rpcUrl } = ARC_FEE_CHAINS[network];
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
    userOperation: {
      // 번들러가 받는 우선순위 수수료를 쓰고, 상한은 아크 최소값보다 낮아지지 않게 둔다.
      estimateFeesPerGas: async () => {
        const quoted = (await pimlicoClient.getUserOperationGasPrice()).fast;
        const block = await publicClient.getBlock();
        const baseFee = block.baseFeePerGas ?? MIN_MAX_FEE_PER_GAS;
        const doubled = baseFee * BigInt(2);
        const floor = doubled > MIN_MAX_FEE_PER_GAS ? doubled : MIN_MAX_FEE_PER_GAS;
        const maxFeePerGas = quoted.maxFeePerGas > floor ? quoted.maxFeePerGas : floor;
        return {
          maxFeePerGas: maxFeePerGas > quoted.maxPriorityFeePerGas ? maxFeePerGas : quoted.maxPriorityFeePerGas,
          maxPriorityFeePerGas: quoted.maxPriorityFeePerGas,
        };
      },
    },
  });

  return { smartAccountClient, account, publicClient };
}

export type ArcFeeClient = NonNullable<Awaited<ReturnType<typeof createArcFeeClient>>>;
