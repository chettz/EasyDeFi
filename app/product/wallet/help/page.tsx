import Image from "next/image";
import Link from "next/link";
import { HELP_ITEMS } from "@/features/wallet/help";

export default function ProductWalletHelpPage() {
  return (
    <main className="wallet-page wallet-settings">
      <div className="wallet-settings-title">
        <Link href="/product/wallet" className="wallet-back" aria-label="내 지갑으로 돌아가기">
          <Image src="/figma/wallet-back.svg" alt="" width={24} height={24} />
        </Link>
        <h1>도움말</h1>
      </div>
      <section className="wallet-settings-list is-help">
        {HELP_ITEMS.map((item) =>
          item.answer ? (
            <Link key={item.slug} href={`/product/wallet/help/${item.slug}`} className="wallet-settings-row">
              <span>{item.question}</span>
              <span className="wallet-settings-value">›</span>
            </Link>
          ) : (
            <div key={item.slug} className="wallet-settings-row">
              <span>{item.question}</span>
              <span className="wallet-settings-value">›</span>
            </div>
          ),
        )}
      </section>
    </main>
  );
}
