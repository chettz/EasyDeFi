/**
 * Privy embedded EOA를 signer로 하는 스마트 지갑 Kernel 0.3.3 주소를 체인 RPC로 계산
 * RPC 주소는 환경 변수로 받음, 체인에 스마트 계정을 배포하지 않고, 계산된 주소만 반환
 */

import { toKernelSmartAccount } from "permissionless/accounts";
import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type EIP1193Provider,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { arc, arcTestnet, base, baseSepolia, mainnet, sepolia } from "viem/chains";

type EthereumRequest = EIP1193Provider["request"];

const ETHEREUM_CHAINS = [
  { name: "ethereum", chain: mainnet, rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL },
  { name: "sepolia", chain: sepolia, rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL },
] as const;

const ARC_CHAINS = [
  { name: "arc", chain: arc, rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL },
  { name: "arcTestnet", chain: arcTestnet, rpcUrl: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL },
] as const;

const BASE_CHAINS = [
  { name: "base", chain: base, rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL },
  { name: "baseSepolia", chain: baseSepolia, rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL },
] as const;

// Kernel 스마트 계정 공통 정보(공통 계산 조건)
const KERNEL_ACCOUNT = {
  version: "0.3.3",
  index: BigInt(0),
  entryPoint: {
    address: entryPoint07Address,
    version: "0.7",
  },
} as const;

// 체인과 RPC 주소를 받아 Kernel 스마트 계정 주소 계산
async function getKernelAddress(
  chain: Chain,
  rpcUrl: string,
  request: EthereumRequest,
): Promise<Address> {
  const account = await toKernelSmartAccount({
    client: createPublicClient({ chain, transport: http(rpcUrl) }),
    owners: [{ request: (args) => request(args) }],
    ...KERNEL_ACCOUNT,
  });
  return account.address;
}

// 모든 체인에 대해 Kernel 스마트 계정 주소 계산
async function loadKernelAddresses(
  chains: readonly { name: string; chain: Chain; rpcUrl: string | undefined }[],
  request: EthereumRequest,
) {
  return Promise.all(
    chains.map(async ({ name, chain, rpcUrl }) => {
      if (!rpcUrl) {
        console.error(`${name} RPC URL is not set.`);
        return undefined;
      }
      return getKernelAddress(chain, rpcUrl, request).catch((cause: unknown) => {
        console.error(cause);
        return undefined;
      });
    }),
  );
}

export async function getEthereumKernelAddresses(request: EthereumRequest) {
  const [ethereum, sepoliaAddress] = await loadKernelAddresses(ETHEREUM_CHAINS, request);
  return { ethereum, sepolia: sepoliaAddress };
}

export async function getArcKernelAddresses(request: EthereumRequest) {
  const [arcAddress, arcTestnetAddress] = await loadKernelAddresses(ARC_CHAINS, request);
  return { arc: arcAddress, arcTestnet: arcTestnetAddress };
}

export async function getBaseKernelAddresses(request: EthereumRequest) {
  const [baseAddress, baseSepoliaAddress] = await loadKernelAddresses(BASE_CHAINS, request);
  return { base: baseAddress, baseSepolia: baseSepoliaAddress };
}
