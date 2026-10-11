/**
 * ERC-20 paymaster(pimlico)로 가스비를 낼 수 있는 토큰 목록
 * 입금·출금 네트워크 목록과 별개로 관리
 */

type PaymasterToken = {
  address: `0x${string}` | "";
  decimals: 6;
};

export const PAYMASTER_TOKENS = {
  baseSepolia: {
    USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
  },
  base: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  },
  ethereum: {
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  },
  sepolia: {
    USDC: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
  },
} as const satisfies Record<string, Record<string, PaymasterToken>>;

const PAYMASTER_NETWORK = {
  이더리움: "ethereum",
  sepolia: "sepolia",
  base: "base",
  baseSepolia: "baseSepolia",
} as const;

export function getPaymasterToken(network: keyof typeof PAYMASTER_NETWORK, token: string) {
  const tokens = PAYMASTER_TOKENS[PAYMASTER_NETWORK[network]] as Record<string, PaymasterToken>;
  const entry = tokens[token];
  if (!entry?.address) return null;
  return { address: entry.address, decimals: entry.decimals };
}
