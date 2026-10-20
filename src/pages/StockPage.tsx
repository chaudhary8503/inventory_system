import { useMemo, useState } from 'react';
import { balances, stockAvailability, type Category } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { CATEGORY_LABELS, formatQty } from '../format';
import { useAsync } from '../hooks';
import { go } from '../router';
import type { Session } from '../session';

type Level = 'ok' | 'low' | 'out' | 'none';

function level(onHand: number, reorder: number | null | undefined): Level {
  if (reorder === null || reorder === undefined) return 'none';
  if (onHand <= 0) return 'out';
  if (onHand <= reorder) return 'low';
  return 'ok';
}

/** Stock of every item at every location (feet / kg / pcs / m), with low-stock highlighting. */
function StockPage({ session }: { session: Session }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([stockAvailability(), balances()]),
    [],
  );

  const locations = session.locations;
  const rows = useMemo(() => {
    if (!data) return [];
    const [avail, bal] = data;
    const reorder = new Map(bal.map((b) => [`${b.item_id}:${b.location_id}`, b.reorder_level]));
    const byItem = new Map<string, Map<string, number>>();
    for (const a of avail) {
      if (!byItem.has(a.item_id)) byItem.set(a.item_id, new Map());
      byItem.get(a.item_id)!.set(a.location_id, a.quantity);
    }
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return session.items
      .filter((i) => i.active && byItem.has(i.item_id))
      .filter((i) => !category || i.category === category)
      .filter((i) => words.every((w) => `${i.name} ${i.code ?? ''}`.toLowerCase().includes(w)))
      .map((i) => {
        const qty = byItem.get(i.item_id)!;
        const cells = locations.map((l) => {
          const q = qty.get(l.location_id) ?? 0;
          return { locationId: l.location_id, qty: q, level: level(q, reorder.get(`${i.item_id}:${l.location_id}`)) };
        });
        const total = cells.reduce((s, c) => s + c.qty, 0);
        return { item: i, cells, total, alert: cells.some((c) => c.level === 'low' || c.level === 'out') };
      })
      .filter((r) => !onlyAlerts || r.alert)
      .filter((r) => !hideEmpty || r.total !== 0);
  }, [data, session.items, locations, search, category, onlyAlerts, hideEmpty]);

  const alertCount = rows.filter((r) => r.alert).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock on hand</h1>
          <p className="page-sub">Every item at every location. Click an item for its bobbins, history and reorder levels.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <input
            className="grow"
            type="search"
            placeholder="Search, e.g. 2.5 3 core"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search items"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
            Low / out only
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
            Hide zero stock
          </label>
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
                  {locations.map((l) => (
                    <th key={l.location_id} className="num">
                      {l.name}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.item.item_id} className="clickable" onClick={() => go(`item/${r.item.item_id}`)}>
                    <td className="wrap">{r.item.name}</td>
                    <td>{CATEGORY_LABELS[r.item.category]}</td>
                    {r.cells.map((c) => (
                      <td
                        key={c.locationId}
                        className={`mono num ${c.level === 'low' || c.level === 'out' ? 'qty-low' : c.qty === 0 ? 'qty-zero' : ''}`}
                        title={c.level === 'out' ? 'Out of stock' : c.level === 'low' ? 'At or below reorder level' : undefined}
                      >
                        {formatQty(c.qty)}
                      </td>
                    ))}
                    <td className="mono num">{formatQty(r.total, r.item.base_unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="table-note">
            {rows.length} items{alertCount > 0 ? ` · ${alertCount} with low or no stock somewhere` : ''}. Amber = at or
            below the reorder level.
          </p>
        )}
      </div>
    </>
  );
}

export default StockPage;
