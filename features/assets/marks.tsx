import Image from "next/image";
import type { DepositNetwork, DepositToken } from "@/lib/deposit/networks";
import type { PortfolioProduct } from "@/lib/portfolio/position-history";

type MarkSize = 24 | 32 | 48;

export function TokenMark({ token, size }: { token: DepositToken; size: MarkSize }) {
  return (
    <span className={`assets-slot assets-slot-${size}`}>
      <span className="assets-slot-art">
        <Image
          src={token === "USDC" ? "/figma/usdc-logo.svg" : "/figma/asset-usdt.svg"}
          alt=""
          width={token === "USDC" ? 24 : 32}
          height={token === "USDC" ? 24 : 32}
          className={token === "USDC" ? "assets-usdc" : undefined}
        />
      </span>
    </span>
  );
}

export function ProductMark({ product, size }: { product: PortfolioProduct; size: 32 | 48 }) {
  return (
    <span className={`assets-slot assets-slot-${size}`}>
      <span className={`assets-slot-art${product === "morpho" ? " assets-morpho" : ""}`}>
        <Image
          src={product === "aave" ? "/figma/asset-aave.svg" : "/figma/asset-morpho.svg"}
          alt=""
          width={product === "aave" ? 32 : 32}
          height={product === "aave" ? 17 : 32}
          className={product === "aave" ? "assets-aave" : undefined}
        />
      </span>
    </span>
  );
}

export function NetworkMark({ network }: { network: DepositNetwork }) {
  if (network === "base") {
    return (
      <span className="assets-net-icon">
        <Image src="/figma/asset-base.svg" alt="" width={13} height={13} className="assets-base" />
      </span>
    );
  }
  if (network === "카이아") {
    return <Image src="/figma/asset-kaia.png" alt="" width={24} height={24} className="assets-kaia" />;
  }
  if (network === "이더리움") return <EthereumMark />;
  if (network === "아크") {
    return <Image src="/figma/asset-arc.svg" alt="" width={24} height={24} className="assets-arc" />;
  }
  if (network === "솔라나") {
    return <Image src="/figma/asset-solana.svg" alt="" width={22} height={19} className="assets-solana" />;
  }
  return null;
}

function EthereumMark() {
  return (
    <span className="assets-eth" aria-hidden>
      <Image src="/figma/asset-eth-1.svg" alt="" width={7} height={15} />
      <Image src="/figma/asset-eth-2.svg" alt="" width={7} height={15} />
      <Image src="/figma/asset-eth-0.svg" alt="" width={14} height={7} />
      <Image src="/figma/asset-eth-3.svg" alt="" width={7} height={10} />
      <Image src="/figma/asset-eth-4.svg" alt="" width={7} height={10} />
    </span>
  );
}
