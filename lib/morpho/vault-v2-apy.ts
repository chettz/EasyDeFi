/**
 * vault address와 chainId를 입력하면 Morpho Vault V2 avgNetAPY를 리턴
 */

// Morpho 상태 조회 url
const MORPHO_GRAPHQL = "https://api.morpho.org/graphql";

const QUERY = `
  query Vault($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      avgNetApy
    }
  }
`;

// address : vault address
export async function getMorphoVaultV2Apy(address: string, chainId: number) {
  const response = await fetch(MORPHO_GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      query: QUERY,
      variables: { address, chainId },
    }),
  });
  if (!response.ok) throw new Error("Morpho APY request failed.");

  const body = await response.json();
  const avgNetApy = body?.data?.vaultV2ByAddress?.avgNetApy;
  if (typeof avgNetApy !== "number" || !Number.isFinite(avgNetApy)) {
    throw new Error("Morpho APY was not returned.");
  }
  return `${(avgNetApy * 100).toFixed(2)}%`;
}
