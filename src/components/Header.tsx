import { signOut } from '../auth';
import { PORTAL_URL } from '../config';
import { href } from '../router';
import type { Session } from '../session';
import './Header.css';

export interface NavEntry {
  key: string;
  label: string;
  /** Sidebar section heading; consecutive entries with the same group are listed together. */
  group: string;
  allowed: boolean;
}

interface HeaderProps {
  session: Session;
  /** Small screens only: the sidebar is hidden behind a Menu button. */
  menuOpen: boolean;
  onMenuToggle: () => void;
}

function Header({ session, menuOpen, onMenuToggle }: HeaderProps) {
  return (
    <header className="no-print">
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
        <button
          type="button"
          className="btn btn-secondary btn-small menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={onMenuToggle}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>
    </header>
  );
}

export default Header;
