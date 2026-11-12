import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <Link href="/" className="legal-brand">
          <span className="brand-dot" />
          <strong>El tablero.</strong>
        </Link>
        <h1>{title}</h1>
        <p className="legal-updated">Última actualización: {updated}</p>
      </header>
      <article className="legal-body">{children}</article>
      <footer className="legal-foot">
        <Link href="/privacidad">Privacidad</Link>
        <span>·</span>
        <Link href="/terminos">Términos</Link>
        <span>·</span>
        <Link href="/">Volver a El tablero.</Link>
      </footer>
    </main>
  );
}
