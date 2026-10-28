import { href } from '../router';
import type { NavEntry } from './Header';
import './Sidebar.css';

interface SidebarProps {
  nav: NavEntry[];
  active: string;
  /** Small screens only: whether the menu panel is showing. */
  open: boolean;
  onNavigate: () => void;
}

// Same look as production-monitor's SidebarNav, with grouped sections.
function Sidebar({ nav, active, open, onNavigate }: SidebarProps) {
  const groups: { name: string; entries: NavEntry[] }[] = [];
  for (const entry of nav) {
    if (!entry.allowed) continue;
    const last = groups[groups.length - 1];
    if (last?.name === entry.group) last.entries.push(entry);
    else groups.push({ name: entry.group, entries: [entry] });
  }

  return (
    <nav id="sidebar" className={`sidebar no-print${open ? ' open' : ''}`} aria-label="Inventory sections">
      {groups.map((g) => (
        <div key={g.name} className="sidebar-group">
          <div className="sidebar-label">{g.name}</div>
          {g.entries.map((n) => (
            <a
              key={n.key}
              href={href(n.key)}
              className={n.key === active ? 'active' : undefined}
              aria-current={n.key === active ? 'page' : undefined}
              onClick={onNavigate}
            >
              {n.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default Sidebar;
