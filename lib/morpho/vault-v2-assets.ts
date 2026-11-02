/**
 * Base Steakhouse Prime USDC 볼트에 넣어 둔 현재 가치를 USDC 최소 단위로 읽는다.
 * 지분 개수가 아니라 convertToAssets 값이라 붙은 이자가 포함된다.
 */

import { createPublicClient, http, isAddress } from "viem";
import { base } from "viem/chains";

const STEAKHOUSE_PRIME_USDC = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";

const vaultAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function getMorphoVaultV2Assets(owner: string) {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
  if (!isAddress(owner) || !rpcUrl) return undefined;

  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  try {
    const shares = await client.readContract({
      address: STEAKHOUSE_PRIME_USDC,
      abi: vaultAbi,
      functionName: "balanceOf",
      args: [owner],
    });
    if (shares === BigInt(0)) return BigInt(0);
    return client.readContract({
      address: STEAKHOUSE_PRIME_USDC,
      abi: vaultAbi,
      functionName: "convertToAssets",
      args: [shares],
    });
  } catch (cause) {
    console.error(cause);
    return undefined;
  }
}
