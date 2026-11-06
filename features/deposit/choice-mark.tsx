import Image from "next/image";
import type { DepositNetwork, DepositToken } from "@/lib/deposit/networks";

export function ChoiceMark({
  token,
  network,
}: {
  token?: DepositToken;
  network?: DepositNetwork;
}) {
  if (token === "USDC" || token === "USDT") {
    return (
      <span className="move-choice-badge">
        <Image
          src={token === "USDC" ? "/figma/usdc-logo.svg" : "/figma/asset-usdt.svg"}
          alt=""
          width={14}
          height={14}
        />
      </span>
    );
  }

  if (network === "아크") {
    return (
      <span className="move-choice-badge">
        <Image src="/figma/asset-arc.svg" alt="" width={14} height={14} />
      </span>
    );
  }

  if (network === "카이아") {
    return (
      <span className="move-choice-badge">
        <Image src="/figma/asset-kaia.png" alt="" width={14} height={14} />
      </span>
    );
  }

  if (network === "base") {
    return (
      <span className="move-choice-badge is-plate">
        <Image src="/figma/asset-base.svg" alt="" width={8} height={8} />
      </span>
    );
  }

  if (network === "솔라나") {
    return (
      <span className="move-choice-badge is-plate">
        <Image src="/figma/asset-solana.svg" alt="" width={11} height={9} />
      </span>
    );
  }

  if (network === "이더리움") {
    return (
      <span className="move-choice-badge is-plate">
        <span className="move-choice-eth" aria-hidden>
          <span className="move-choice-eth-art">
            <Image src="/figma/asset-eth-1.svg" alt="" width={7} height={15} />
            <Image src="/figma/asset-eth-2.svg" alt="" width={7} height={15} />
            <Image src="/figma/asset-eth-0.svg" alt="" width={14} height={7} />
            <Image src="/figma/asset-eth-3.svg" alt="" width={7} height={10} />
            <Image src="/figma/asset-eth-4.svg" alt="" width={7} height={10} />
          </span>
        </span>
      </span>
    );
  }

  return null;
}
