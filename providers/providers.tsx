"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { baseSepolia, kaia, kairos } from "viem/chains";

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["google", "email", "wallet"],
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, kaia, kairos],
        appearance: {
          walletChainType: "ethereum-only",
          walletList: [
            "metamask",
            "phantom",
            "detected_ethereum_wallets",
            "detected_solana_wallets",
          ],
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        // Privy embedded EOA는 custom Kernel의 signer로, Solana wallet은 native wallet으로 사용
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
