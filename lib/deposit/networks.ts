/**
 * 입금 화면에서 고를 수 있는 토큰과, 토큰별 네트워크 목록.
 * 계정 주소를 만들거나 조회하지 않음
 */

export const TOKEN_NETWORKS = {
  // Sepolia에는 Tether가 발행한 USDT가 없음
  USDT: ["이더리움", "카이아", "kaiaKairos"],
  USDC: ["이더리움", "아크", "솔라나", "sepolia", "arcTestnet", "Devnet", "base", "baseSepolia"],
} as const;

export type DepositToken = keyof typeof TOKEN_NETWORKS;
export type DepositNetwork = (typeof TOKEN_NETWORKS)[DepositToken][number];

const NETWORK_LABELS: Partial<Record<DepositNetwork, string>> = {
  이더리움: "Ethereum",
  base: "base",
  아크: "Arc",
  솔라나: "Solana",
  카이아: "kaia",
};

export function depositNetworkLabel(network: string) {
  return NETWORK_LABELS[network as DepositNetwork] ?? network;
}

// 내 자산은 메인넷 잔액만 집계한다. 테스트넷 토큰을 달러로 치면 총자산이 부풀기 때문이다.
export const ASSET_MAINNETS = new Set<DepositNetwork>(["이더리움", "카이아", "아크", "솔라나", "base"]);
