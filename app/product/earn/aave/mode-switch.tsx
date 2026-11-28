"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

type Mode = 0 | 1;

let previousMode: Mode | null = null;

export function SupplyModeSwitch({ mode }: { mode: Mode }) {
  const [shown, setShown] = useState<Mode>(previousMode ?? mode);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShown(mode);
      previousMode = mode;
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  return (
    <div
      className="earn-supply-switch"
      role="tablist"
      aria-label="넣기 또는 꺼내기"
      data-shown={shown}
      style={{ "--switch-index": shown } as CSSProperties}
    >
      <span className="earn-supply-switch-highlight" aria-hidden="true" />
      {mode === 0 ? (
        <button type="button" role="tab" aria-selected="true">
          넣기
        </button>
      ) : (
        <Link href="/product/earn/aave/supply" role="tab" aria-selected="false">
          넣기
        </Link>
      )}
      {mode === 1 ? (
        <button type="button" role="tab" aria-selected="true">
          꺼내기
        </button>
      ) : (
        <Link href="/product/earn/aave/withdraw" role="tab" aria-selected="false">
          꺼내기
        </Link>
      )}
    </div>
  );
}
