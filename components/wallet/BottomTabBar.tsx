"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

type Tab = {
  label: string;
  href?: string;
  icon: string;
  activeIcon?: string;
  wallet?: boolean;
};

const tabs: readonly Tab[] = [
  {
    label: "홈",
    href: "/product",
    icon: "/figma/tab-home.svg",
    activeIcon: "/figma/tab-home-active.svg",
  },
  { label: "예치", href: "/product/earn", icon: "/figma/tab-history.svg", activeIcon: "/figma/tab-earn-active.svg" },
  {
    label: "입출금",
    href: "/product/transfer",
    icon: "/figma/tab-transfer-inactive.svg",
    activeIcon: "/figma/tab-deposit.svg",
    wallet: true,
  },
  { label: "거래내역", href: "/product/transactions", icon: "/figma/tab-wallet.svg", activeIcon: "/figma/tab-wallet-active.svg" },
  { label: "내 자산", href: "/product/assets", icon: "/figma/tab-transfer.svg", activeIcon: "/figma/tab-transfer-active.svg" },
];

function isActive(tab: Tab, pathname: string) {
  if (tab.wallet) return ["/product/transfer", "/product/deposit", "/product/withdraw"].includes(pathname);
  if (tab.href === "/product/earn") return pathname === "/product/earn" || pathname.startsWith("/product/earn/");
  if (tab.href === "/product/assets") return pathname === "/product/assets" || pathname.startsWith("/product/assets/");
  if (tab.href === "/product/transactions") {
    return pathname === "/product/transactions" || pathname.startsWith("/product/transactions/");
  }
  return tab.href === pathname;
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const index = Math.max(0, tabs.findIndex((tab) => isActive(tab, pathname)));
  const [shown, setShown] = useState(index);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(index));
    return () => cancelAnimationFrame(frame);
  }, [index]);

  return (
    <nav
      className="wallet-tabbar"
      aria-label="주요 메뉴"
      style={{ "--tab-index": shown } as CSSProperties}
    >
      <span className="wallet-tabbar-pill" aria-hidden="true" />
      {tabs.map((tab) => {
        const active = isActive(tab, pathname);
        const content = (
          <>
            <Image
              src={active ? (tab.activeIcon ?? tab.icon) : tab.icon}
              alt=""
              width={22}
              height={22}
              aria-hidden
            />
            <span>{tab.label}</span>
          </>
        );

        return tab.href ? (
          <Link
            key={tab.label}
            href={tab.href}
            className="wallet-tab"
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        ) : (
          <button
            key={tab.label}
            type="button"
            className="wallet-tab"
            aria-label={`${tab.label} (준비 중)`}
            disabled
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
