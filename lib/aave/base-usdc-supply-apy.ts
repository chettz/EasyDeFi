/**
 * Aave Base USDC 풀의 공급 연 수익률만 읽는다.
 * 예치 트랜잭션은 보내지 않는다.
 */

import { getTokenContract } from "../deposit/token-contracts";

// Aave v3 Base Pool
const AAVE_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
// Aave v3 상태 조회 url
const AAVE_GRAPHQL = "https://api.v3.aave.com/graphql";

const QUERY = `
  query Reserve($request: ReserveRequest!) {
    reserve(request: $request) {
      supplyInfo {
        apy {
          formatted
        }
      }
    }
  }
`;

export async function getBaseUsdcSupplyApy() {
  const usdc = getTokenContract("USDC", "base");
  if (!usdc || usdc.kind !== "erc20") throw new Error("Base USDC is not configured.");

  const response = await fetch(AAVE_GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      query: QUERY,
      variables: {
        request: {
          chainId: 8453,
          market: AAVE_BASE_POOL,
          underlyingToken: usdc.address,
        },
      },
    }),
  });
  if (!response.ok) throw new Error("Aave APY request failed.");

  const body = await response.json();
  const formatted = body?.data?.reserve?.supplyInfo?.apy?.formatted;
  if (typeof formatted !== "string" || formatted.length === 0) {
    throw new Error("Aave APY was not returned.");
  }
  return `${formatted}%`;
}
