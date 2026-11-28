"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { ChoiceMark } from "@/features/deposit/choice-mark";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { depositNetworkLabel, type DepositNetwork } from "@/lib/deposit/networks";

const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1.5rem",
  borderBottom: "1px solid #888",
  padding: "0.85rem 0",
};

const CHAINS: DepositNetwork[] = [
  "이더리움",
  "base",
  "아크",
  "솔라나",
  "카이아",
  "sepolia",
  "baseSepolia",
  "arcTestnet",
  "Devnet",
  "kaiaKairos",
];

const CHAIN_ICON: Partial<Record<DepositNetwork, DepositNetwork>> = {
  sepolia: "이더리움",
  baseSepolia: "base",
  arcTestnet: "아크",
  Devnet: "솔라나",
  kaiaKairos: "카이아",
};

export default function LoginAccountPage() {
  const { ready, authenticated, login } = usePrivy();
  const { accounts, embeddedWallet, walletsReady, isLoading, failed } = useDepositAccounts();
  const waiting = !walletsReady || (embeddedWallet ? isLoading : false);

  if (!ready) return <p>확인 중</p>;
  if (!authenticated) {
    return (
      <main style={page}>
        <button type="button" onClick={login}>Login</button>
      </main>
    );
  }

  return (
    <main style={page}>
      <p><Link href="/lab/wallet">내 지갑</Link></p>
      <h1>체인별 주소</h1>
      <section style={{ border: "1px solid #888", padding: "0 1rem" }}>
        {CHAINS.map((network) => {
          const address = getDepositAddress(network, accounts);
          const value = address ?? (failed ? "주소를 불러오지 못했습니다." : waiting ? "확인 중" : "주소 없음");
          return (
            <div key={network} style={row}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <ChoiceMark network={CHAIN_ICON[network] ?? network} />
                {depositNetworkLabel(network)}
              </span>
              <span style={{ wordBreak: "break-all", textAlign: "right" }}>{value}</span>
            </div>
          );
        })}
      </section>
    </main>
  );
}
