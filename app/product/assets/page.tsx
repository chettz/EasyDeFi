"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getBaseUsdcWithdrawable } from "@/lib/aave/supply-base-usdc";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { ASSET_MAINNETS, TOKEN_NETWORKS, type DepositToken } from "@/lib/deposit/networks";
import { getMorphoVaultV2Assets } from "@/lib/morpho/vault-v2-assets";
import { PORTFOLIO_PRODUCTS, type PortfolioProduct } from "@/lib/portfolio/position-history";
import { sumKnownBalances } from "@/lib/withdraw/sum-balances";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";
import { ProductMark, TokenMark } from "@/features/assets/marks";
import { asUsd, formatQuantity, formatTotal, formatUsd, type AssetRates, type AssetUnit } from "@/features/assets/format";

const tokens = ["USDC", "USDT"] as const satisfies readonly DepositToken[];
const units = ["USD", "BTC", "KRW"] as const satisfies readonly AssetUnit[];

type Position = { id: PortfolioProduct; name: string; amount: bigint };

export default function ProductAssetsPage() {
  const { accounts, isLoading } = useDepositAccounts();
  const [holdings, setHoldings] = useState<{ token: DepositToken; amount: bigint }[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [unit, setUnit] = useState<AssetUnit>("USD");
  const [rates, setRates] = useState<AssetRates | null>(null);
  const [unitOpen, setUnitOpen] = useState(false);
  const unitRef = useRef<HTMLDivElement>(null);

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
    if (!unitOpen) return;
    function close(event: MouseEvent) {
      if (!unitRef.current?.contains(event.target as Node)) setUnitOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [unitOpen]);

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
      const nextPositions: Position[] = [];
      if (typeof aave === "bigint" && aave > BigInt(0)) {
        nextPositions.push({ id: "aave", name: PORTFOLIO_PRODUCTS.aave, amount: aave });
      }
      if (typeof morpho === "bigint" && morpho > BigInt(0)) {
        nextPositions.push({ id: "morpho", name: PORTFOLIO_PRODUCTS.morpho, amount: morpho });
      }
      setPositions(nextPositions);
    });

    return () => {
      cancelled = true;
    };
  }, [accounts, isLoading]);

  if (isLoading || holdings === null || positions === null) {
    return <p className="wallet-centered-status">확인 중</p>;
  }

  const total = [...holdings, ...positions].reduce((sum, item) => sum + asUsd(item.amount), 0);

  return (
    <main className="wallet-page assets-page">
      <h1>내 자산</h1>
      <section className="assets-total" aria-label="총 자산">
        <span>총 자산</span>
        <div className="assets-total-row">
          <strong>{formatTotal(total, unit, rates)}</strong>
          <div className="assets-menu" ref={unitRef}>
            <button
              type="button"
              className="assets-unit"
              aria-expanded={unitOpen}
              aria-haspopup="listbox"
              onClick={() => setUnitOpen((open) => !open)}
            >
              {unit}
              <Image src="/figma/asset-unit-caret.svg" alt="" width={12} height={12} />
            </button>
            {unitOpen ? (
              <div className="assets-unit-menu" role="listbox" aria-label="자산 단위">
                {units.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={option === unit}
                    onClick={() => {
                      setUnit(option);
                      setUnitOpen(false);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <div className="assets-actions">
        <Link href="/product/deposit" className="assets-deposit">입금</Link>
        <Link href="/product/withdraw" className="assets-withdraw">출금</Link>
      </div>
      <section className="assets-section">
        <h2>자산</h2>
        <div className="assets-columns">
          <span>이름</span>
          <span>수량</span>
        </div>
        {holdings.length === 0 ? (
          <p className="assets-empty">가진 토큰이 없어요.</p>
        ) : (
          <div className="assets-list">
            {holdings.map((item) => (
              <Link key={item.token} href={`/product/assets/${item.token}`}>
                <TokenMark token={item.token} size={32} />
                <strong>{item.token}</strong>
                <span>
                  <b>{formatQuantity(item.amount)}</b>
                  <small>{formatUsd(asUsd(item.amount))}</small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="assets-section">
        <h2>포트폴리오</h2>
        <div className="assets-columns">
          <span>이름</span>
          <span>수량</span>
        </div>
        {positions.length === 0 ? (
          <p className="assets-empty">예치한 상품이 없어요.</p>
        ) : (
          <div className="assets-list">
            {positions.map((item) => (
              <Link key={item.id} href={`/product/assets/portfolio/${item.id}`}>
                <ProductMark product={item.id} size={32} />
                <strong>{item.name}</strong>
                <span>
                  <b>{formatQuantity(item.amount)} USDC</b>
                  <small>{formatUsd(asUsd(item.amount))}</small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
