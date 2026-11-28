import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalDocument } from "./legal";

const PHRASES = [
  ["개인정보 국외 이전 안내", "/product/wallet/legal/transfer"],
  ["국외 이전 안내", "/product/wallet/legal/transfer"],
  ["개인정보 처리방침", "/product/wallet/legal/privacy"],
] as const;

function linkedText(text: string, slug: string): ReactNode[] {
  const pattern = /(개인정보 국외 이전 안내|국외 이전 안내|개인정보 처리방침)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const phrase = match[0];
    const href = PHRASES.find(([label]) => label === phrase)?.[1];
    if (href && !href.endsWith(`/${slug}`)) {
      nodes.push(
        <Link key={`${index}-${phrase}`} href={href} className="wallet-legal-link">
          {phrase}
        </Link>,
      );
    } else {
      nodes.push(phrase);
    }
    last = index + phrase.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article className="wallet-legal-body">
      {document.blocks.map((block, index) => {
        if (block.kind === "meta") {
          return (
            <p key={index} className="wallet-legal-meta">
              {linkedText(block.text, document.slug)}
            </p>
          );
        }
        if (block.kind === "prose") {
          return <p key={index}>{linkedText(block.text, document.slug)}</p>;
        }
        if (block.kind === "chapter") {
          return <h2 key={index}>{block.title}</h2>;
        }
        if (block.kind === "callout") {
          return (
            <section key={index} className="wallet-legal-callout">
              <h2>{block.title}</h2>
              {block.paragraphs.map((paragraph) => (
                <p key={paragraph}>{linkedText(paragraph, document.slug)}</p>
              ))}
            </section>
          );
        }
        if (block.kind === "glance") {
          return (
            <section key={index} className="wallet-legal-glance">
              <h2>{block.title}</h2>
              {block.rows.map((row) => (
                <div key={row.label}>
                  <strong>{row.label}</strong>
                  <p>{linkedText(row.value, document.slug)}</p>
                </div>
              ))}
            </section>
          );
        }
        if (block.kind === "facts") {
          return (
            <dl key={index} className="wallet-legal-facts">
              {block.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{linkedText(row.value, document.slug)}</dd>
                </div>
              ))}
            </dl>
          );
        }
        if (block.kind === "button") {
          return (
            <Link key={index} href={block.href} className="wallet-legal-button">
              {block.label}
            </Link>
          );
        }
        return (
          <section key={index} className={block.emphasis ? "wallet-legal-article is-emphasis" : "wallet-legal-article"}>
            <h2>{block.title}</h2>
            {block.paragraphs.map((paragraph) => (
              <p key={paragraph}>{linkedText(paragraph, document.slug)}</p>
            ))}
          </section>
        );
      })}
    </article>
  );
}
