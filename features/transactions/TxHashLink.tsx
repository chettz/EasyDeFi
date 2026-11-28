import { explorerTxUrl, wrapAtBytes } from "@/features/transactions/display";

export function TxHashLink({ network, hash }: { network: string; hash: string | null }) {
  if (!hash) return "-";
  const href = explorerTxUrl(network, hash);
  const wrapped = wrapAtBytes(hash);
  if (!href) return <span className="tx-wrapped-value">{wrapped}</span>;
  return (
    <a className="tx-hash-link" href={href} target="_blank" rel="noreferrer">
      {wrapped}
    </a>
  );
}
