import type { ReactNode } from 'react';
import type { Bobbin, Item, Location } from '../api';
import { listBobbins } from '../api';
import { formatQty } from '../format';
import { useAsync } from '../hooks';

export function Banner({ kind, children }: { kind: 'ok' | 'error' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ what = 'Loading…' }: { what?: string }) {
  return <div className="state">{what}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}

export function NoAccess() {
  return (
    <div className="card">
      <h1 className="page-title">Not available</h1>
      <p className="page-sub">You don't have permission for this page. Ask the owner if you need it.</p>
    </div>
  );
}

interface LocationSelectProps {
  id?: string;
  locations: Location[];
  value: string;
  onChange: (id: string) => void;
  /** Only these ids are selectable (the rest are hidden). */
  allowedIds?: string[];
  placeholder?: string;
  exclude?: string;
}

export function LocationSelect({ id, locations, value, onChange, allowedIds, placeholder, exclude }: LocationSelectProps) {
  const options = locations.filter(
    (l) => (!allowedIds || allowedIds.includes(l.location_id)) && l.location_id !== exclude,
  );
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? 'Choose a location'}</option>
      {options.map((l) => (
        <option key={l.location_id} value={l.location_id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

interface QuantityInputProps {
  id?: string;
  item: Item | undefined;
  amount: string;
  unit: string;
  onAmount: (v: string) => void;
  onUnit: (u: string) => void;
  allowNegative?: boolean;
  placeholder?: string;
}

/** Amount plus a unit dropdown (base unit and the item's alternative units). */
export function QuantityInput({ id, item, amount, unit, onAmount, onUnit, allowNegative, placeholder }: QuantityInputProps) {
  const units = item?.units ?? [];
  return (
    <div className="inline-input">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min={allowNegative ? undefined : 0}
        placeholder={placeholder ?? '0'}
        value={amount}
        onChange={(e) => onAmount(e.target.value)}
      />
      <select value={unit} onChange={(e) => onUnit(e.target.value)} aria-label="Unit" disabled={units.length <= 1}>
        {units.length === 0 && <option value="">unit</option>}
        {units.map((u) => (
          <option key={u.unit} value={u.unit}>
            {u.unit}
          </option>
        ))}
      </select>
    </div>
  );
}

interface BobbinSelectProps {
  id?: string;
  itemId: string;
  locationId: string;
  value: string;
  onChange: (bobbin: Bobbin | undefined) => void;
  /** Bumped by the parent after a save, to reload remaining lengths. */
  refreshKey?: number;
  emptyLabel?: string;
}

/** Bobbins of one cable at one location, in auto-pick order. */
export function BobbinSelect({ id, itemId, locationId, value, onChange, refreshKey, emptyLabel }: BobbinSelectProps) {
  const { data, loading, error } = useAsync(
    () => (itemId && locationId ? listBobbins(itemId, locationId) : Promise.resolve([] as Bobbin[])),
    [itemId, locationId, refreshKey],
  );
  const bobbins = data ?? [];
  return (
    <>
      <select
        id={id}
        value={value}
        disabled={!itemId || !locationId || loading}
        onChange={(e) => onChange(bobbins.find((b) => b.bobbin_id === e.target.value))}
      >
        <option value="">
          {loading ? 'Loading bobbins…' : bobbins.length === 0 ? 'No bobbins here' : (emptyLabel ?? 'Choose a bobbin')}
        </option>
        {bobbins.map((b) => (
          <option key={b.bobbin_id} value={b.bobbin_id}>
            {b.bobbin_no} — {formatQty(b.remaining_ft, 'ft')} of {formatQty(b.original_ft, 'ft')}
            {b.opened ? ' (opened)' : ''}
          </option>
        ))}
      </select>
      {error && <div className="hint">{error}</div>}
    </>
  );
}
