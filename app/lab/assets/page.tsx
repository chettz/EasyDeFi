"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getBaseUsdcWithdrawable } from "@/lib/aave/supply-base-usdc";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { ASSET_MAINNETS, TOKEN_NETWORKS, type DepositToken } from "@/lib/deposit/networks";
import { getMorphoVaultV2Assets } from "@/lib/morpho/vault-v2-assets";
import { PORTFOLIO_PRODUCTS, type PortfolioProduct } from "@/lib/portfolio/position-history";
import { sumKnownBalances } from "@/lib/withdraw/sum-balances";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";

const tokens = ["USDC", "USDT"] as const satisfies readonly DepositToken[];
const page = { width: "100%", padding: "2rem 3rem", boxSizing: "border-box" as const };
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1.5rem",
  border: "1px solid #888",
  padding: "0.75rem 1rem",
  color: "inherit",
  textDecoration: "none",
};

type Unit = "USD" | "KRW" | "BTC";
type Rates = { btcUsd: number; krwPerUsd: number };
type Position = { id: PortfolioProduct; name: string; amount: bigint };

function asUsd(amount: bigint) {
  return Number(formatUnits(amount, 6));
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTotal(value: number, unit: Unit, rates: Rates | null) {
  if (unit === "USD") return formatUsd(value);
  if (!rates) return "조회 실패";
  if (unit === "KRW") return `₩${Math.round(value * rates.krwPerUsd).toLocaleString("ko-KR")}`;
  return `${(value / rates.btcUsd).toLocaleString("en-US", { maximumFractionDigits: 8 })} BTC`;
}

export default function AssetsPage() {
  const { ready, authenticated, login } = usePrivy();
  const { accounts, isLoading } = useDepositAccounts();
  const [holdings, setHoldings] = useState<{ token: DepositToken; amount: bigint }[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [unit, setUnit] = useState<Unit>("USD");
  const [rates, setRates] = useState<Rates | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,krw")
      .then((response) => response.json())
      .then((body: { bitcoin?: { usd?: number; krw?: number } }) => {
        const btcUsd = body?.bitcoin?.usd;
        const btcKrw = body?.bitcoin?.krw;
        if (cancelled || typeof btcUsd !== "number" || typeof btcKrw !== "number" || btcUsd <= 0) return;
        setRates({ btcUsd, krwPerUsd: btcKrw / btcUsd });
      })
      .catch((cause: unknown) => console.error(cause));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    const base = getDepositAddress("base", accounts);

    async function loadToken(token: DepositToken) {
      const networks = TOKEN_NETWORKS[token].filter((network) => ASSET_MAINNETS.has(network));
      const amounts = await Promise.all(
        networks.map((network) => {
          const owner = getDepositAddress(network, accounts);
          return owner ? getDepositTokenBalance(token, network, owner) : Promise.resolve(undefined);
        }),
      );
      return { token, amount: sumKnownBalances(amounts).total, known: amounts.some((amount) => amount !== undefined) };
    }

    Promise.all([
      Promise.all(tokens.map(loadToken)),
      base ? getBaseUsdcWithdrawable(base) : Promise.resolve(undefined),
      base ? getMorphoVaultV2Assets(base) : Promise.resolve(undefined),
    ]).then(([loaded, aave, morpho]) => {
      if (cancelled) return;
      setHoldings(
        loaded
          .filter((item) => item.known && item.amount > BigInt(0))
          .map(({ token, amount }) => ({ token, amount })),
      );
      setPositions(
        [
          typeof aave === "bigint" && aave > BigInt(0) ? { id: "aave", name: PORTFOLIO_PRODUCTS.aave, amount: aave } : null,
          typeof morpho === "bigint" && morpho > BigInt(0) ? { id: "morpho", name: PORTFOLIO_PRODUCTS.morpho, amount: morpho } : null,
        ].filter((item): item is Position => item !== null),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [accounts, isLoading]);

  if (!ready) return <p>확인 중</p>;
  if (!authenticated) {
    return (
      <main style={page}>
        <button type="button" onClick={login}>Login</button>
      </main>
    );
  }
  if (isLoading || holdings === null || positions === null) return <p>확인 중</p>;

  const total = [...holdings, ...positions].reduce((sum, item) => sum + asUsd(item.amount), 0);

  return (
    <main style={page}>
      <h1>내 자산</h1>
      <div style={{ ...row, marginBottom: "2rem" }}>
        <label>
          총자산{" "}
          <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
            <option value="USD">USD</option>
            <option value="KRW">KRW</option>
            <option value="BTC">BTC</option>
          </select>
        </label>
        <strong>{formatTotal(total, unit, rates)}</strong>
      </div>

      <h2>자산 목록</h2>
      {holdings.length === 0 ? (
        <p>가진 토큰이 없어요.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {holdings.map((item) => (
            <Link key={item.token} href={`/lab/assets/${item.token}`} style={row}>
              <strong>{item.token}</strong>
              <span style={{ textAlign: "right" }}>
                {formatUnits(item.amount, 6)}
                <br />
                {formatUsd(asUsd(item.amount))}
              </span>
            </Link>
          ))}
        </div>
      )}

      <h2>포트폴리오</h2>
      {positions.length === 0 ? (
        <p>예치한 상품이 없어요.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {positions.map((item) => (
            <Link key={item.id} href={`/lab/assets/portfolio/${item.id}`} style={row}>
              <strong>{item.name}</strong>
              <span style={{ textAlign: "right" }}>
                {formatUnits(item.amount, 6)} USDC
                <br />
                {formatUsd(asUsd(item.amount))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
