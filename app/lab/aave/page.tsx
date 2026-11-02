"use client";

import { useEffect, useState } from "react";
import { SupplyBaseUsdcForm } from "@/features/aave/SupplyBaseUsdcForm";
import { WithdrawBaseUsdcForm } from "@/features/aave/WithdrawBaseUsdcForm";
import { getBaseUsdcSupplyApy } from "@/lib/aave/base-usdc-supply-apy";

export default function AavePage() {
  // 이 화면에는 연수익률 칸이 없다. 팝업을 열 때가 아니라 화면을 열 때 한 번만 받아 둔다.
  const [supplyApy, setSupplyApy] = useState("확인 중");

  useEffect(() => {
    let cancelled = false;
    getBaseUsdcSupplyApy()
      .then((value) => {
        if (!cancelled) setSupplyApy(value);
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled) setSupplyApy("조회 실패");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <section style={{ border: "1px solid #888", padding: "1rem" }}>
        <h1>Aavv base market USDC pool</h1>
        <SupplyBaseUsdcForm supplyApy={supplyApy} />
        <div style={{ marginTop: "0.75rem" }}>
          <WithdrawBaseUsdcForm />
        </div>
      </section>
    </main>
  );
}
