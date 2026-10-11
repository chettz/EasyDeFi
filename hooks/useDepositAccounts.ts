"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import type { EIP1193Provider } from "viem";
import type { DepositAccounts } from "@/lib/deposit/deposit-address";
import {
  getArcKernelAddresses,
  getBaseKernelAddresses,
  getEthereumKernelAddresses,
} from "@/lib/deposit/kernel-address";

export function useDepositAccounts() {
  const { authenticated, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [kernelAccounts, setKernelAccounts] = useState<DepositAccounts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy");
  const solanaWallet = user?.linkedAccounts.find(
    (account) => account.type === "wallet" && account.chainType === "solana",
  );
  const solanaAddress =
    solanaWallet && "address" in solanaWallet ? solanaWallet.address : undefined;
  const active = authenticated && walletsReady && Boolean(embeddedWallet);

  useEffect(() => {
    if (!authenticated || !walletsReady || !embeddedWallet) return;

    let cancelled = false;
    const signer = embeddedWallet;

    async function loadAccounts() {
      setIsLoading(true);
      setFailed(false);
      try {
        const provider = await signer.getEthereumProvider();
        const request = provider.request.bind(provider) as EIP1193Provider["request"];
        const [ethereum, arc, base] = await Promise.all([
          getEthereumKernelAddresses(request),
          getArcKernelAddresses(request),
          getBaseKernelAddresses(request),
        ]);
        if (cancelled) return;
        setKernelAccounts({
          ethereumKernel: ethereum.ethereum,
          sepoliaKernel: ethereum.sepolia,
          arcKernel: arc.arc,
          arcTestnetKernel: arc.arcTestnet,
          baseKernel: base.base,
          baseSepoliaKernel: base.baseSepolia,
        });
      } catch (cause) {
        console.error(cause);
        if (!cancelled) {
          setKernelAccounts({});
          setFailed(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [authenticated, walletsReady, embeddedWallet]);

  const accounts = useMemo<DepositAccounts>(
    () =>
      active
        ? {
            ...kernelAccounts,
            evmEoa: embeddedWallet?.address,
            solana: solanaAddress,
          }
        : {},
    [active, kernelAccounts, embeddedWallet?.address, solanaAddress],
  );

  return {
    accounts,
    embeddedWallet,
    isLoading: active ? isLoading : authenticated,
    failed: active && failed,
    walletsReady,
  };
}
