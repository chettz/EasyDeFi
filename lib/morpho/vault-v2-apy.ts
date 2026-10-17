/**
 * Morpho 볼트 2.0의 연 수익률만 읽는다.
 * 예치 트랜잭션은 보내지 않는다.
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

// address : vauly address
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
  // avgNetApy는 비율이다. 0.047이면 4.7%다.
  const avgNetApy = body?.data?.vaultV2ByAddress?.avgNetApy;
  if (typeof avgNetApy !== "number" || !Number.isFinite(avgNetApy)) {
    throw new Error("Morpho APY was not returned.");
  }
  return `${(avgNetApy * 100).toFixed(2)}%`;
}
