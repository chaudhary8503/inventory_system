import { signOut } from '../auth';
import { PORTAL_URL } from '../config';
import { href } from '../router';
import type { Session } from '../session';
import './Header.css';

export interface NavEntry {
  key: string;
  label: string;
  allowed: boolean;
}

interface HeaderProps {
  session: Session;
  nav: NavEntry[];
  active: string;
}

function Header({ session, nav, active }: HeaderProps) {
  return (
    <header>
      <div className="header-top">
        <a className="brand" href={href('')}>
          <img className="brand-mark" src="/powerant-logo.jpg" alt="Powerant" />
          <div>
            <div className="brand-name">Inventory</div>
            <div className="brand-sub">Stock, bundles and movements</div>
          </div>
        </a>
        <div className="header-user">
          <span className="header-name">{session.user.displayName}</span>
          <a className="btn btn-secondary btn-small" href={PORTAL_URL}>
            Portal
          </a>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
      <nav className="main-nav" aria-label="Inventory sections">
        {nav
          .filter((n) => n.allowed)
          .map((n) => (
            <a key={n.key} href={href(n.key)} className={n.key === active ? 'active' : undefined}>
              {n.label}
            </a>
          ))}
      </nav>
    </header>
  );
}

export default Header;
