import WalletShell from "@/components/wallet/WalletShell";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <WalletShell>{children}</WalletShell>;
}
