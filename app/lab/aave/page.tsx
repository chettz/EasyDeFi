"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { FormEvent, useState } from "react";
import { parseUnits, type EIP1193Provider } from "viem";
import { supplyBaseUsdc, withdrawBaseUsdc } from "@/lib/aave/supply-base-usdc";
import { createPaymasterFeeClient } from "@/lib/paymaster/fee-client";

const fieldStyle = { border: "1px solid #888", padding: "0.5rem", marginTop: "0.25rem", width: "16rem" };

export default function AavePage() {
  const { authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  // 출금 화면과 같은 Privy 내장 지갑. 이 지갑이 Kernel의 서명자다.
  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy");
  const [supplyAmount, setSupplyAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSupplying, setIsSupplying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [supplyMessage, setSupplyMessage] = useState<string | null>(null);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);

  async function onSupply(event: FormEvent) {
    event.preventDefault();
    setSupplyMessage(null);

    // USDC는 소수 6자리다. 빈 값이나 형식이 다르면 시작하지 않는다.
    let amount: bigint;
    try {
      amount = parseUnits(supplyAmount.trim(), 6);
    } catch {
      setSupplyMessage("공급을 시작하지 못했습니다.");
      return;
    }
    if (amount <= BigInt(0) || !authenticated || !walletsReady || !embeddedWallet) {
      setSupplyMessage("공급을 시작하지 못했습니다.");
      return;
    }

    setIsSupplying(true);
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      // Base Kernel 클라이언트. 만들 때는 보내지 않고, 아래 supply에서 보낸다.
      const request = provider.request.bind(provider) as EIP1193Provider["request"];
      const client = await createPaymasterFeeClient("base", request);
      if (!client) {
        setSupplyMessage("공급을 시작하지 못했습니다.");
        return;
      }
      await supplyBaseUsdc({ client, amount });
      setSupplyAmount("");
      setSupplyMessage("공급이 완료되었습니다.");
    } catch (cause) {
      console.error(cause);
      setSupplyMessage("공급에 실패했습니다.");
    } finally {
      setIsSupplying(false);
    }
  }

  async function onWithdraw(event: FormEvent) {
    event.preventDefault();
    setWithdrawMessage(null);

    // Supply와 같이 USDC 소수 6자리로 읽는다. 빈 값과 0은 보내지 않는다.
    let amount: bigint;
    try {
      amount = parseUnits(withdrawAmount.trim(), 6);
    } catch {
      setWithdrawMessage("인출을 시작하지 못했습니다.");
      return;
    }
    if (amount <= BigInt(0) || !authenticated || !walletsReady || !embeddedWallet) {
      setWithdrawMessage("인출을 시작하지 못했습니다.");
      return;
    }

    setIsWithdrawing(true);
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      // Supply와 같은 Base Kernel 클라이언트다. 인출 호출만 다르다.
      const request = provider.request.bind(provider) as EIP1193Provider["request"];
      const client = await createPaymasterFeeClient("base", request);
      if (!client) {
        setWithdrawMessage("인출을 시작하지 못했습니다.");
        return;
      }
      await withdrawBaseUsdc({ client, amount });
      setWithdrawAmount("");
      setWithdrawMessage("인출이 완료되었습니다.");
    } catch (cause) {
      console.error(cause);
      setWithdrawMessage("인출에 실패했습니다.");
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <section style={{ border: "1px solid #888", padding: "1rem" }}>
        <h1>Aavv base market USDC pool</h1>
        <form onSubmit={(event) => void onSupply(event)} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            value={supplyAmount}
            onChange={(event) => setSupplyAmount(event.target.value)}
            inputMode="decimal"
            aria-label="Supply 수량"
            style={fieldStyle}
          />
          <button type="submit" disabled={isSupplying}>
            Supply
          </button>
        </form>
        {supplyMessage && <p>{supplyMessage}</p>}
        <form onSubmit={(event) => void onWithdraw(event)} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          <input
            value={withdrawAmount}
            onChange={(event) => setWithdrawAmount(event.target.value)}
            inputMode="decimal"
            aria-label="Withdraw 수량"
            style={fieldStyle}
          />
          <button type="submit" disabled={isWithdrawing}>
            Withdraw
          </button>
        </form>
        {withdrawMessage && <p>{withdrawMessage}</p>}
      </section>
    </main>
  );
}
