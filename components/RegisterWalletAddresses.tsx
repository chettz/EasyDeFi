"use client";

import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCreateWallet as useCreateSolanaWallet } from "@privy-io/react-auth/solana";
import { useEffect, useRef } from "react";

export function RegisterWalletAddresses() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();
  const registering = useRef(false);
  const attempted = useRef<string | null>(null);
  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy");
  const hasEthereumWallet = user?.linkedAccounts.some(
    (account) => account.type === "wallet" && account.chainType === "ethereum",
  );
  const hasSolanaWallet = user?.linkedAccounts.some(
    (account) => account.type === "wallet" && account.chainType === "solana",
  );

  useEffect(() => {
    if (!ready || !authenticated || !user || (hasEthereumWallet && hasSolanaWallet)) return;

    const attemptKey = `${user.id}:${Boolean(hasEthereumWallet)}:${Boolean(hasSolanaWallet)}`;
    if (attempted.current === attemptKey) return;
    attempted.current = attemptKey;

    async function create() {
      try {
        if (!hasEthereumWallet) await createWallet();
        if (!hasSolanaWallet) await createSolanaWallet();
      } catch (cause) {
        console.error(cause);
      }
    }

    void create();
  }, [
    authenticated,
    createSolanaWallet,
    createWallet,
    hasEthereumWallet,
    hasSolanaWallet,
    ready,
    user,
  ]);

  useEffect(() => {
    if (!ready || !walletsReady || !authenticated || !user || !embeddedWallet || registering.current) return;

    const storageKey = `easydefi:wallet-addresses:v3:${user.id}`;
    if (sessionStorage.getItem(storageKey)) return;
    registering.current = true;

    async function register() {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Privy access token was not returned.");

        const response = await fetch("/api/wallet-addresses/register", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Wallet registration failed: ${response.status}`);

        sessionStorage.setItem(storageKey, "registered");
      } catch (cause) {
        console.error(cause);
      } finally {
        registering.current = false;
      }
    }

    void register();
  }, [authenticated, embeddedWallet, getAccessToken, ready, user, walletsReady]);

  return null;
}
