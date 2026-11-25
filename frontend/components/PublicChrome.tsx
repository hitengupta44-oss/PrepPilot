import Link from 'next/link';
import { Logo } from './ui';
import { SITE } from '@/lib/site';

export function PublicNav() {
  return (
    <header className="public-nav">
      <div className="inner">
        <Logo />
        <nav className="links">
          <a href="/#features">Features</a>
          <a href="/#tracks">Roles</a>
          <a href="/#how">How it works</a>
        </nav>
        <div className="spacer" />
        <Link href="/login" className="btn btn-ghost">Sign in</Link>
        <Link href="/login" className="btn btn-primary">Get started</Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="footer">
      <div className="container inner">
        <Logo />
        <span>© {new Date().getFullYear()} {SITE.name}</span>
        <div className="spacer" />
        <Link href="/terms">Terms &amp; Conditions</Link>
        <Link href="/privacy">Privacy Policy</Link>
        {SITE.contactEmail && <a href={`mailto:${SITE.contactEmail}`}>Contact</a>}
      </div>
    </footer>
  );
}
