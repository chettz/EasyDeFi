"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChoiceMark } from "@/features/deposit/choice-mark";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import { depositNetworkLabel, type DepositNetwork } from "@/lib/deposit/networks";

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

export default function ProductWalletAccountPage() {
  const { authenticated } = usePrivy();
  const { accounts, embeddedWallet, walletsReady, isLoading, failed } = useDepositAccounts();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const waiting = !walletsReady || (embeddedWallet ? isLoading : false);

  async function onCopy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => {
        copiedTimer.current = null;
        setCopied(false);
      }, 2000);
    } catch (cause) {
      console.error(cause);
    }
  }

  const shell = copied && typeof document !== "undefined" ? document.querySelector(".wallet-shell") : null;

  return (
    <main className="wallet-page wallet-settings">
      <div className="wallet-settings-title">
        <Link href="/product/wallet" className="wallet-back" aria-label="내 지갑으로 돌아가기">
          <Image src="/figma/wallet-back.svg" alt="" width={24} height={24} />
        </Link>
        <h1>내 지갑 주소</h1>
      </div>
      <section className="wallet-settings-list">
        {CHAINS.map((network) => {
          const address = authenticated ? getDepositAddress(network, accounts) : undefined;
          const value = address ?? (failed ? "주소를 불러오지 못했습니다." : waiting ? "확인 중" : "주소 없음");
          return (
            <div key={network} className="wallet-settings-row">
              <span className="wallet-settings-network">
                <ChoiceMark network={CHAIN_ICON[network] ?? network} />
                {depositNetworkLabel(network)}
              </span>
              <span className="wallet-settings-value wallet-settings-address">
                <span>{value}</span>
                {address && (
                  <button type="button" className="wallet-icon-button wallet-settings-copy" aria-label="주소 복사" onClick={() => void onCopy(address)}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M9.17 7.5h7.5c.92 0 1.66.75 1.66 1.67v7.5c0 .92-.74 1.66-1.66 1.66h-7.5c-.92 0-1.67-.74-1.67-1.66v-7.5c0-.92.75-1.67 1.67-1.67Z" />
                      <path d="M4.17 12.5H3.33c-.44 0-.86-.18-1.17-.49-.31-.31-.49-.73-.49-1.18V3.33c0-.44.18-.86.49-1.17.31-.32.73-.49 1.17-.49h7.5c.45 0 .87.17 1.18.49.31.31.49.73.49 1.17v.84" />
                    </svg>
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </section>
      {shell
        ? createPortal(
            <p className="wallet-copy-toast" role="status">
              복사됨
            </p>,
            shell,
          )
        : null}
    </main>
  );
}
