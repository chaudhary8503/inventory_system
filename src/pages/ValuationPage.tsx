import { useMemo, useState } from 'react';
import { stockValuation, type Category } from '../api';
import { Banner, Empty, Loading, LocationSelect } from '../components/Common';
import { CATEGORY_LABELS, CATEGORY_ORDER, formatMoney, formatQty, formatUnitCost } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';

/** Stock value per item and location (view_costs). */
function ValuationPage({ session }: { session: Session }) {
  const { data, error, loading, reload } = useAsync(stockValuation, []);
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState<Category | ''>('');

  const rows = useMemo(
    () => (data ?? []).filter((r) => (!locationId || r.location_id === locationId) && (!category || r.category === category)),
    [data, locationId, category],
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const byCategory = ([...CATEGORY_ORDER] as Category[]).map((c) => ({
    c,
    value: rows.filter((r) => r.category === c).reduce((s, r) => s + r.value, 0),
  }));
  const pendingFt = rows.reduce((s, r) => s + r.pending_ft, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock value</h1>
          <p className="page-sub">
            Raw materials at weighted average cost. Cable per bundle: the production order's cost, or the item's standard
            cost while the order isn't finalized.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="facts">
        <div className="fact">
          <div className="fact-label">Total</div>
          <div className="fact-value mono">{formatMoney(total)}</div>
        </div>
        {byCategory.map((b) => (
          <div className="fact" key={b.c}>
            <div className="fact-label">{CATEGORY_LABELS[b.c]}</div>
            <div className="fact-value mono">{formatMoney(b.value)}</div>
          </div>
        ))}
      </div>

      {pendingFt > 0 && (
        <Banner kind="info">
          {formatQty(pendingFt, 'ft')} of cable is valued at standard cost because its production order isn't finalized yet.
        </Banner>
      )}

      <div className="card">
        <div className="filters">
          <LocationSelect locations={session.locations} value={locationId} onChange={setLocationId} placeholder="All locations" />
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No stock to value.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Location</th>
                  <th className="num">Quantity</th>
                  <th className="num">Cost per unit</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.item_id}:${r.location_id}`}>
                    <td className="wrap">
                      <a href={href(`item/${r.item_id}`)}>{r.item_name}</a>
                      {r.pending_ft > 0 && <div className="sub">{formatQty(r.pending_ft, 'ft')} at standard cost</div>}
                    </td>
                    <td>{r.location_name}</td>
                    <td className="mono num">{formatQty(r.quantity, r.unit)}</td>
                    <td className="mono num">{formatUnitCost(r.avg_unit_cost, r.unit)}</td>
                    <td className="mono num">{formatMoney(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default ValuationPage;
