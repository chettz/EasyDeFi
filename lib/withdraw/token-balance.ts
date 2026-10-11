/**
 * 선택한 토큰의 입금 주소 잔고(=사용자 지갑 잔고)를 읽음 -> 출금 시 사용자 잔액 조회에 사용
 * 입금 주소와 컨트랙트 표는 lib/deposit를 사용
 * 잔고를 읽지 못하면 undefined를 반환, 잔고 0과 구분
 */

import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { address, createSolanaRpc, devnet, mainnet as solanaMainnet } from "@solana/kit";
import { createPublicClient, erc20Abi, http, isAddress, type Chain } from "viem";
import { arc, arcTestnet, base, baseSepolia, kaia, kairos, mainnet, sepolia } from "viem/chains";
import type { DepositNetwork, DepositToken } from "../deposit/networks";
import { getTokenContract } from "../deposit/token-contracts";

const EVM_NETWORKS: Partial<Record<DepositNetwork, { chain: Chain; rpcUrl: string | undefined }>> = {
  이더리움: { chain: mainnet, rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL },
  sepolia: { chain: sepolia, rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL },
  카이아: { chain: kaia, rpcUrl: process.env.NEXT_PUBLIC_KAIA_RPC_URL },
  kaiaKairos: { chain: kairos, rpcUrl: process.env.NEXT_PUBLIC_KAIA_KAIROS_RPC_URL },
  아크: { chain: arc, rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL },
  arcTestnet: { chain: arcTestnet, rpcUrl: process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL },
  base: { chain: base, rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL },
  baseSepolia: { chain: baseSepolia, rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL },
};

const SOLANA_NETWORKS: Partial<Record<DepositNetwork, { rpcUrl: string | undefined; cluster: "mainnet" | "devnet" }>> = {
  솔라나: { rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL, cluster: "mainnet" },
  Devnet: { rpcUrl: process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL, cluster: "devnet" },
};

export async function getDepositTokenBalance(
  token: DepositToken,
  network: DepositNetwork,
  owner: string, // 사용자 지갑 주소(입금 주소)
): Promise<bigint | undefined> {
  const contract = getTokenContract(token, network);
  if (!contract) return undefined;

  try {
    if (contract.kind === "erc20") {
      if (!isAddress(owner)) return undefined;
      const target = EVM_NETWORKS[network];
      if (!target?.rpcUrl) {
        console.error(`${network} RPC URL is not set.`);
        return undefined;
      }
      const client = createPublicClient({ chain: target.chain, transport: http(target.rpcUrl) });
      // 잔고 조회(EVM)
      return client.readContract({
        address: contract.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
    }

    // 지갑과 민트로 토큰 계정 주소를 계산하고, 그 계정의 잔액을 읽음
    const target = SOLANA_NETWORKS[network];
    if (!target?.rpcUrl) {
      console.error(`${network} RPC URL is not set.`);
      return undefined;
    }
    const rpcUrl = target.cluster === "devnet" ? devnet(target.rpcUrl) : solanaMainnet(target.rpcUrl);
    const rpc = createSolanaRpc(rpcUrl);
    const [tokenAccount] = await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(contract.address),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    try {
      const response = await rpc.getTokenAccountBalance(tokenAccount).send();
      return BigInt(response.value.amount);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("could not find account")) {
        return BigInt(0);
      }
      throw cause;
    }
  } catch (cause) {
    console.error(cause);
    return undefined;
  }
}
