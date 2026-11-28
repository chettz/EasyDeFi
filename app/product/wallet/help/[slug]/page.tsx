import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findHelpItem } from "@/features/wallet/help";

export default async function ProductWalletHelpAnswerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = findHelpItem(slug);
  if (!item?.answer) notFound();

  return (
    <main className="wallet-page wallet-settings">
      <div className="wallet-settings-title">
        <Link href="/product/wallet/help" className="wallet-back" aria-label="도움말로 돌아가기">
          <Image src="/figma/wallet-back.svg" alt="" width={24} height={24} />
        </Link>
        <h1>도움말</h1>
      </div>
      <article className="wallet-help-answer">
        <h2>{item.question}</h2>
        <p>{item.answer}</p>
        {item.warning && (
          <div className="wallet-warning wallet-note">
            <span>
              <strong>{item.warning[0]}</strong>
              {item.warning[1] && (
                <>
                  <br />
                  {item.warning[1]}
                </>
              )}
            </span>
          </div>
        )}
      </article>
    </main>
  );
}
