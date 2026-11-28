export type RecoveryAccount =
  | { method: "email"; email: string }
  | { method: "wallet"; address: string };

type RecoveryCandidate = {
  type?: string;
  address?: string | null;
  email?: string | null;
  chainType?: string;
  walletClientType?: string | null;
  latestVerifiedAt?: Date | string | number | null;
};

function verifiedAt(value: RecoveryCandidate["latestVerifiedAt"]) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function recoveryAccount(accounts: RecoveryCandidate[]): RecoveryAccount | null {
  const candidates = accounts.filter((account) => {
    if (account.type === "email" || account.type === "google_oauth") return true;
    return account.type === "wallet" && account.chainType === "ethereum" && account.walletClientType !== "privy";
  });
  const latest = candidates.reduce<RecoveryCandidate | undefined>((current, account) => {
    if (!current) return account;
    return verifiedAt(account.latestVerifiedAt) >= verifiedAt(current.latestVerifiedAt) ? account : current;
  }, undefined);

  if (latest?.type === "wallet" && latest.address) return { method: "wallet", address: latest.address };
  if (latest?.type === "google_oauth" && latest.email) return { method: "email", email: latest.email };
  if (latest?.type === "email" && latest.address) return { method: "email", email: latest.address };
  return null;
}

export function shortWalletAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
