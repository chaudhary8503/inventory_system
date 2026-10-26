import type { SessionUser } from './auth';
import type { Item, Location } from './api';
import { MODULE } from './config';

/** Everything a page needs about who is signed in and the shared lists. */
export interface Session {
  user: SessionUser;
  /** True if the owner, or the box is ticked. Hiding UI only; the database enforces. */
  can: (permission: string) => boolean;
  items: Item[];
  /** Active locations. */
  locations: Location[];
  /** Location ids this person may change stock at (all, for the owner). */
  stockLocationIds: string[];
  reloadCatalog: () => Promise<void>;
  /** The person's own feet / metres setting (lengths are always stored in feet). */
  lengthUnit: 'ft' | 'm';
  /** Editable list of adjustment reasons (Settings). */
  adjustmentReasons: string[];
}

export function makeCan(user: SessionUser): (permission: string) => boolean {
  return (permission) =>
    user.isOwner || user.permissions.some((p) => p.module === MODULE && p.permission_key === permission);
}

export function itemById(session: Session, id: string | null | undefined): Item | undefined {
  return id ? session.items.find((i) => i.item_id === id) : undefined;
}

export function locationName(session: Session, id: string | null | undefined): string {
  return session.locations.find((l) => l.location_id === id)?.name ?? '—';
}
