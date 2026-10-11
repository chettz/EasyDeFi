"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  { label: "예치", icon: "/figma/tab-history.svg" },
  {
    label: "입출금",
    href: "/product/transfer",
    icon: "/figma/tab-transfer-inactive.svg",
    activeIcon: "/figma/tab-deposit.svg",
    wallet: true,
  },
  { label: "거래내역", icon: "/figma/tab-wallet.svg" },
  { label: "내 자산", icon: "/figma/tab-transfer.svg" },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="wallet-tabbar" aria-label="주요 메뉴">
      {tabs.map((tab) => {
        const active = tab.wallet
          ? ["/product/transfer", "/product/deposit", "/product/withdraw"].includes(pathname)
          : tab.href === pathname;
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
