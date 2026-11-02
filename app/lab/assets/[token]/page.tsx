"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { ASSET_MAINNETS, TOKEN_NETWORKS, type DepositNetwork, type DepositToken } from "@/lib/deposit/networks";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";

const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const cell = { border: "1px solid #888", padding: "0.75rem 1rem", textAlign: "left" as const };

function isToken(value: string): value is DepositToken {
  return value === "USDC" || value === "USDT";
}

function formatUsd(amount: bigint) {
  const value = Number(formatUnits(amount, 6));
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TokenAssetsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenParam } = use(params);
  const token = isToken(tokenParam) ? tokenParam : null;
  const { ready, authenticated, login } = usePrivy();
  const { accounts, isLoading } = useDepositAccounts();
  const [rows, setRows] = useState<{ network: DepositNetwork; amount: bigint | undefined }[] | null>(null);

  useEffect(() => {
    if (!token || isLoading) return;
    let cancelled = false;
    const networks = TOKEN_NETWORKS[token].filter((network) => ASSET_MAINNETS.has(network));
    Promise.all(
      networks.map(async (network) => {
        const owner = getDepositAddress(network, accounts);
        const amount = owner ? await getDepositTokenBalance(token, network, owner) : undefined;
        return { network, amount };
      }),
    ).then((loaded) => {
      if (!cancelled) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [accounts, isLoading, token]);

  if (!token) return <p>없는 토큰이에요.</p>;
  if (!ready) return <p>확인 중</p>;
  if (!authenticated) {
    return (
      <main style={page}>
        <button type="button" onClick={login}>Login</button>
      </main>
    );
  }
  if (isLoading || rows === null) return <p>확인 중</p>;

  return (
    <main style={page}>
      <p>
        <Link href="/lab/assets">내 자산</Link>
      </p>
      <h1>{token}</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={cell}>이름</th>
            <th style={cell}>네트워크</th>
            <th style={{ ...cell, textAlign: "right" }}>수량</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.network}>
              <td style={cell}>{token}</td>
              <td style={cell}>{row.network}</td>
              <td style={{ ...cell, textAlign: "right" }}>
                {row.amount === undefined ? (
                  "조회 실패"
                ) : (
                  <>
                    {formatUnits(row.amount, 6)}
                    <br />
                    {formatUsd(row.amount)}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
