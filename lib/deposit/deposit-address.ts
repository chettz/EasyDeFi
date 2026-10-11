/**
 * 입금 네트워크가 어떤 계정 주소를 쓰는지 매핑
 * 계정 생성하지 않음. 이미 있는 주소만 받아 표시용 문자열 반환
 */

import type { DepositNetwork } from "./networks";

export type DepositAccounts = {
  solana?: string;
  ethereumKernel?: string;
  sepoliaKernel?: string;
  evmEoa?: string;
  arcKernel?: string;
  arcTestnetKernel?: string;
  baseKernel?: string;
  baseSepoliaKernel?: string;
};

const ADDRESS_SOURCE: Partial<Record<DepositNetwork, keyof DepositAccounts>> = {
  솔라나: "solana",
  Devnet: "solana",
  이더리움: "ethereumKernel",
  sepolia: "sepoliaKernel",
  카이아: "evmEoa",
  kaiaKairos: "evmEoa",
  아크: "arcKernel",
  arcTestnet: "arcTestnetKernel",
  base: "baseKernel",
  baseSepolia: "baseSepoliaKernel",
};

export function getDepositAddress(
  network: DepositNetwork,
  accounts: DepositAccounts,
): string | undefined {
  const source = ADDRESS_SOURCE[network];
  if (!source) return undefined;
  return accounts[source];
}
