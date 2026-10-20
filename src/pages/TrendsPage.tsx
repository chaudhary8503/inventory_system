import { useMemo, useState } from 'react';
import { consumptionTrend, type Category } from '../api';
import { Banner, Empty, Loading, LocationSelect } from '../components/Common';
import { CATEGORY_LABELS, daysAgo, formatDate, formatQty, todayKarachi } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import type { Session } from '../session';

type Bucket = 'day' | 'week' | 'month';

/** Copper, PVC, rope and other consumables used by Production, per period. */
function TrendsPage({ session }: { session: Session }) {
  const [from, setFrom] = useState(daysAgo(180));
  const [to, setTo] = useState(todayKarachi());
  const [bucket, setBucket] = useState<Bucket>('month');
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState<Category | ''>('');

  const { data, error, loading } = useAsync(() => consumptionTrend(from, to, bucket, locationId || null), [from, to, bucket, locationId]);

  const table = useMemo(() => {
    const rows = (data ?? []).filter((r) => !category || r.category === category);
    const buckets = [...new Set(rows.map((r) => r.bucket_start))].sort();
    const items = new Map<string, { name: string; unit: string; category: Category; values: Map<string, number>; total: number }>();
    for (const r of rows) {
      if (!items.has(r.item_id)) items.set(r.item_id, { name: r.item_name, unit: r.unit, category: r.category, values: new Map(), total: 0 });
      const it = items.get(r.item_id)!;
      it.values.set(r.bucket_start, (it.values.get(r.bucket_start) ?? 0) + r.quantity);
      it.total += r.quantity;
    }
    return { buckets, items: [...items.entries()].sort((a, b) => a[1].category.localeCompare(b[1].category) || a[1].name.localeCompare(b[1].name)) };
  }, [data, category]);

  const label = (iso: string) =>
    bucket === 'month'
      ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(`${iso.slice(0, 10)}T00:00:00`))
      : bucket === 'week'
        ? `Wk of ${formatDate(iso)}`
        : formatDate(iso);

  return (
    <>
      <h1 className="page-title">Consumption trends</h1>
      <p className="page-sub">Material used in production, per {bucket}. Cancelled production entries are left out.</p>
      <div className="card">
        <div className="filters">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={to} max={todayKarachi()} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} aria-label="Group by">
            <option value="month">By month</option>
            <option value="week">By week</option>
            <option value="day">By day</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
            <option value="">All materials</option>
            <option value="copper">{CATEGORY_LABELS.copper}</option>
            <option value="pvc">{CATEGORY_LABELS.pvc}</option>
            <option value="consumable">{CATEGORY_LABELS.consumable}</option>
          </select>
          <LocationSelect locations={session.locations} value={locationId} onChange={setLocationId} placeholder="All locations" />
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : table.items.length === 0 ? (
          <Empty>No production use recorded in this range.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  {table.buckets.map((b) => (
                    <th key={b} className="num">
                      {label(b)}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {table.items.map(([id, it]) => (
                  <tr key={id}>
                    <td className="wrap">
                      <a href={href(`item/${id}`)}>{it.name}</a>
                      <div className="sub">{CATEGORY_LABELS[it.category]}</div>
                    </td>
                    {table.buckets.map((b) => (
                      <td key={b} className={`mono num ${it.values.get(b) ? '' : 'qty-zero'}`}>
                        {formatQty(it.values.get(b) ?? 0)}
                      </td>
                    ))}
                    <td className="mono num">{formatQty(it.total, it.unit)}</td>
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

export default TrendsPage;
