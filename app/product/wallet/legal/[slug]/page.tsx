import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/features/wallet/LegalDocument";
import { findLegalDocument } from "@/features/wallet/legal";

export default async function ProductWalletLegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const document = findLegalDocument(slug);
  if (!document) notFound();

  return (
    <main className="wallet-page wallet-settings wallet-legal">
      <div className="wallet-settings-title">
        <Link href="/product/wallet" className="wallet-back" aria-label="내 지갑으로 돌아가기">
          <Image src="/figma/wallet-back.svg" alt="" width={24} height={24} />
        </Link>
        <h1>{document.title}</h1>
      </div>
      <LegalDocumentView document={document} />
    </main>
  );
}
