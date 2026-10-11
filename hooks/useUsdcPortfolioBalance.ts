"use client";

import { useEffect, useState } from "react";
import { useDepositAccounts } from "@/hooks/useDepositAccounts";
import { getDepositAddress } from "@/lib/deposit/deposit-address";
import type { DepositNetwork } from "@/lib/deposit/networks";
import { sumKnownBalances } from "@/lib/withdraw/sum-balances";
import { getDepositTokenBalance } from "@/lib/withdraw/token-balance";

const MAINNETS = ["이더리움", "아크", "솔라나", "base"] as const satisfies readonly DepositNetwork[];
const TESTNETS = ["sepolia", "arcTestnet", "Devnet", "baseSepolia"] as const satisfies readonly DepositNetwork[];

export function useUsdcPortfolioBalance() {
  const { accounts, isLoading: accountsLoading, failed: accountsFailed } = useDepositAccounts();
  const [mainnetTotal, setMainnetTotal] = useState<bigint | null>(null);
  const [testnetTotal, setTestnetTotal] = useState<bigint | null>(null);
  const [failedNetworks, setFailedNetworks] = useState(0);

  useEffect(() => {
    if (accountsLoading) return;
    let cancelled = false;

    async function loadGroup(networks: readonly DepositNetwork[]) {
      const values = await Promise.all(
        networks.map((network) => {
          const owner = getDepositAddress(network, accounts);
          return owner
            ? getDepositTokenBalance("USDC", network, owner)
            : Promise.resolve(undefined);
        }),
      );
      return sumKnownBalances(values);
    }

    Promise.all([loadGroup(MAINNETS), loadGroup(TESTNETS)]).then(([mainnet, testnet]) => {
      if (cancelled) return;
      setMainnetTotal(mainnet.total);
      setTestnetTotal(testnet.total);
      setFailedNetworks(mainnet.failed + testnet.failed);
    });

    return () => {
      cancelled = true;
    };
  }, [accounts, accountsLoading]);

  return {
    mainnetTotal,
    testnetTotal,
    loading: accountsLoading || mainnetTotal === null || testnetTotal === null,
    failed: accountsFailed || failedNetworks > 0,
  };
}
