import { useMemo, useState } from 'react';
import { stockAvailability, type Item } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { CATEGORY_LABELS, CATEGORY_ORDER, formatQty, formatQtyIn } from '../format';
import { useAsync } from '../hooks';
import { go } from '../router';
import type { Session } from '../session';
import './StockPage.css';

interface Filters {
  search: string;
  size: string;
  cores: string;
  category: string;
  location: string;
  hideZero: boolean;
}

const NO_FILTERS: Filters = { search: '', size: '', cores: '', category: '', location: '', hideZero: false };

interface Row {
  item: Item;
  /** location_id -> quantity in the item's base unit. */
  qty: Map<string, number>;
  total: number;
  /** Lower-cased text the search runs over. */
  text: string;
  /** Every number in that text, so "5" matches "5 core" but not "0.5" or "25". */
  numbers: Set<number>;
}

/** "2.5mm 5core" -> ["2.5", "mm", "5", "core"]. */
function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/(\d)([a-z²])/g, '$1 $2')
    .replace(/([a-z²])(\d)/g, '$1 $2')
    .split(/[\s,/×*]+/)
    .filter(Boolean);
}

const isNumber = (t: string) => /^\d*\.?\d+$/.test(t);

/** Sorts spec values numerically ("1.5" before "10"), text values last. */
function bySpecValue(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  return a.localeCompare(b);
}

/** Stock of every item at every location, with search and filters. */
function StockPage({ session }: { session: Session }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const { data, error, loading, reload } = useAsync(() => stockAvailability(), []);
  const locations = session.locations;

  // Every item that has a stock record somewhere, with its searchable text.
  const allRows = useMemo<Row[]>(() => {
    if (!data) return [];
    const byItem = new Map<string, Map<string, number>>();
    for (const a of data) {
      if (!byItem.has(a.item_id)) byItem.set(a.item_id, new Map());
      byItem.get(a.item_id)!.set(a.location_id, a.quantity);
    }
    return session.items
      .filter((i) => i.active && byItem.has(i.item_id))
      .map((item) => {
        const qty = byItem.get(item.item_id)!;
        const text = [item.name, item.code, item.invoice_name, item.manager_key].filter(Boolean).join(' ').toLowerCase();
        const numbers = new Set((text.match(/\d*\.?\d+/g) ?? []).map(Number));
        let total = 0;
        for (const q of qty.values()) total += q;
        return { item, qty, total, text, numbers };
      });
  }, [data, session.items]);

  const tokens = useMemo(() => searchTokens(f.search), [f.search]);

  /** Does a row pass every filter except `skip` (used for the counts in each dropdown)? */
  const passes = (r: Row, skip?: keyof Filters): boolean => {
    const s = r.item.specs;
    if (skip !== 'search' && !tokens.every((t) => (isNumber(t) ? r.numbers.has(Number(t)) : r.text.includes(t)))) return false;
    if (skip !== 'size' && f.size && s.size_mm2 !== f.size) return false;
    if (skip !== 'cores' && f.cores && s.cores !== f.cores) return false;
    if (skip !== 'category' && f.category && r.item.category !== f.category) return false;
    const location = skip === 'location' ? '' : f.location;
    if (location && !r.qty.has(location)) return false;
    const shown = location ? (r.qty.get(location) ?? 0) : r.total;
    if (skip !== 'hideZero' && f.hideZero && shown === 0) return false;
    return true;
  };

  const rows = allRows.filter((r) => passes(r));

  // Dropdown options with how many items each would show, given the other filters.
  const countBy = (skip: keyof Filters, key: (r: Row) => string | undefined) => {
    const counts = new Map<string, number>();
    let all = 0;
    for (const r of allRows) {
      if (!passes(r, skip)) continue;
      all++;
      const k = key(r);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return { counts, all };
  };
  const sizes = countBy('size', (r) => r.item.specs.size_mm2);
  const cores = countBy('cores', (r) => r.item.specs.cores);
  const categories = countBy('category', (r) => r.item.category);
  // A location counts an item when it has stock there (not zero).
  const locs = (() => {
    const counts = new Map<string, number>();
    let all = 0;
    for (const r of allRows) {
      if (!passes(r, 'location')) continue;
      if (r.total !== 0) all++;
      for (const [loc, q] of r.qty) if (q !== 0) counts.set(loc, (counts.get(loc) ?? 0) + 1);
    }
    return { counts, all };
  })();

  // Every value that exists in stock stays listed (with 0) so a choice never vanishes from under you.
  const sizeValues = [...new Set(allRows.map((r) => r.item.specs.size_mm2).filter((v): v is string => !!v))].sort(bySpecValue);
  const coreValues = [...new Set(allRows.map((r) => r.item.specs.cores).filter((v): v is string => !!v))].sort(bySpecValue);
  const categoryValues = CATEGORY_ORDER.filter((c) => allRows.some((r) => r.item.category === c));

  const shownLocations = f.location ? locations.filter((l) => l.location_id === f.location) : locations;
  const filtered = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock on hand</h1>
          <p className="page-sub">Every item at every location. Click an item for its bundles, history and reorder levels.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="card">
        <div className="stock-filters">
          <input
            className="stock-search"
            type="search"
            placeholder="Search, e.g. 2.5mm 3 core flexible"
            value={f.search}
            onChange={(e) => set('search', e.target.value)}
            aria-label="Search items"
          />
          <div className="stock-filter-row">
            <div className="field">
              <label htmlFor="sf-size">Size (mm²)</label>
              <select id="sf-size" value={f.size} onChange={(e) => set('size', e.target.value)}>
                <option value="">Any size ({sizes.all})</option>
                {sizeValues.map((v) => (
                  <option key={v} value={v}>
                    {v} mm² ({sizes.counts.get(v) ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sf-cores">Cores</label>
              <select id="sf-cores" value={f.cores} onChange={(e) => set('cores', e.target.value)}>
                <option value="">Any cores ({cores.all})</option>
                {coreValues.map((v) => (
                  <option key={v} value={v}>
                    {v} core ({cores.counts.get(v) ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sf-category">Category</label>
              <select id="sf-category" value={f.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">All categories ({categories.all})</option>
                {categoryValues.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]} ({categories.counts.get(c) ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sf-location">Location</label>
              <select id="sf-location" value={f.location} onChange={(e) => set('location', e.target.value)}>
                <option value="">All locations ({locs.all} in stock)</option>
                {locations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.name} ({locs.counts.get(l.location_id) ?? 0} in stock)
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="stock-filter-foot">
            <label className="checkbox">
              <input type="checkbox" checked={f.hideZero} onChange={(e) => set('hideZero', e.target.checked)} />
              Hide zero stock{f.location ? ' at this location' : ''}
            </label>
            {filtered && (
              <button type="button" className="link-btn" onClick={() => setF(NO_FILTERS)}>
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No items match.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  {shownLocations.map((l) => (
                    <th key={l.location_id} className="num">
                      {l.name}
                    </th>
                  ))}
                  {!f.location && <th className="num">Total</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.item.item_id} className="clickable" onClick={() => go(`item/${r.item.item_id}`)}>
                    <td className="wrap">{r.item.name}</td>
                    <td>{CATEGORY_LABELS[r.item.category]}</td>
                    {shownLocations.map((l) => {
                      const q = r.qty.get(l.location_id) ?? 0;
                      return (
                        <td key={l.location_id} className={`mono num${q === 0 ? ' qty-zero' : ''}`}>
                          {f.location ? formatQty(q, r.item.base_unit) : formatQtyIn(q, r.item.base_unit)}
                        </td>
                      );
                    })}
                    {!f.location && <td className="mono num">{formatQty(r.total, r.item.base_unit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="table-note">
            {rows.length} of {allRows.length} items
            {f.location ? ` · showing ${locations.find((l) => l.location_id === f.location)?.name ?? 'one location'} only` : ''}
          </p>
        )}
      </div>
    </>
  );
}

export default StockPage;
