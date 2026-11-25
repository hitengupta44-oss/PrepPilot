import { PublicFooter, PublicNav } from './PublicChrome';
import { SITE } from '@/lib/site';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      <main className="prose">
        <h1>{title}</h1>
        <p className="updated">Last updated: {SITE.legalUpdated}</p>
        {children}
      </main>
      <PublicFooter />
    </>
  );
}

/** "email us at x" if a contact address is configured, otherwise a neutral fallback. */
export function ContactLine() {
  return SITE.contactEmail ? (
    <>by email at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></>
  ) : (
    <>through the contact details published on this website</>
  );
}
