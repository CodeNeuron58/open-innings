import Link from 'next/link';
import { MARKETING_LINKS, FOOTER_ONLY_LINKS } from './links';

/**
 * The site footer. Server component — nothing here needs the pathname.
 */
export function SiteFooter() {
  return (
    <footer className="oi-footer">
      <div className="oi-footer-in">
        <span className="oi-footer-brand">OPEN INNINGS</span>
        <span>Open source. Free with ads, ₹199 a year without.</span>
        <span className="oi-footer-links">
          {[...MARKETING_LINKS, ...FOOTER_ONLY_LINKS].map((link) => (
            <Link key={link.href} href={link.href} className="oi-fl">
              {link.label}
            </Link>
          ))}
        </span>
      </div>
    </footer>
  );
}
