/**
 * 출금 잔고 조회에 쓰는 USDT·USDC 토큰 주소.
 *
 * USDC는 Circle 발행 주소다. https://developers.circle.com/stablecoins/usdc-contract-addresses
 * 아크의 0x3600... 은 네이티브 USDC의 ERC-20 인터페이스
 */

import type { DepositNetwork, DepositToken } from "./networks";

type Erc20Contract = {
  kind: "erc20";
  address: `0x${string}`;
  decimals: 6;
};

type SplMint = {
  kind: "spl";
  address: string;
  decimals: 6;
};

export type TokenContract = Erc20Contract | SplMint;

export const TOKEN_CONTRACTS: {
  [Token in DepositToken]: {
    [Network in (typeof import("./networks").TOKEN_NETWORKS)[Token][number]]: TokenContract | null;
  };
} = {
  USDT: {
    이더리움: {
      kind: "erc20",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
    },
    카이아: {
      kind: "erc20",
      address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb",
      decimals: 6,
    },
    kaiaKairos: {
      kind: "erc20",
      address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb",
      decimals: 6,
    },
  },
  USDC: {
    이더리움: {
      kind: "erc20",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
    },
    아크: {
      kind: "erc20",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
    },
    솔라나: {
      kind: "spl",
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
    },
    sepolia: {
      kind: "erc20",
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      decimals: 6,
    },
    arcTestnet: {
      kind: "erc20",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
    },
    Devnet: {
      kind: "spl",
      address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      decimals: 6,
    },
    base: {
      kind: "erc20",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    },
    baseSepolia: {
      kind: "erc20",
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
    },
  },
};

export function getTokenContract(token: DepositToken, network: DepositNetwork): TokenContract | null {
  const contracts = TOKEN_CONTRACTS[token] as Partial<Record<DepositNetwork, TokenContract | null>>;
  return contracts[network] ?? null;
}
