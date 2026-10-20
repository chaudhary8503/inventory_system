import { useMemo, useState } from 'react';
import { listBobbins } from '../api';
import { Banner, Empty, Loading, LocationSelect } from '../components/Common';
import ItemPicker from '../components/ItemPicker';
import { formatDate, formatQty } from '../format';
import { useAsync } from '../hooks';
import { go } from '../router';
import type { Session } from '../session';

/** Bobbin list per location: number, cable, remaining / original, order, opened. */
function BobbinsPage({ session, query }: { session: Session; query: URLSearchParams }) {
  const [locationId, setLocationId] = useState(query.get('location') ?? '');
  const [itemId, setItemId] = useState(query.get('item') ?? '');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [search, setSearch] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => listBobbins(itemId || null, locationId || null, includeEmpty),
    [itemId, locationId, includeEmpty],
  );

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter((b) => !s || b.bobbin_no.toLowerCase().includes(s));
  }, [data, search]);
  const totalFt = rows.reduce((t, b) => t + b.remaining_ft, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bobbins</h1>
          <p className="page-sub">Every bobbin of finished cable, in the order sales pick them: opened first, then oldest.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload}>
          Refresh
        </button>
      </div>
      <div className="card">
        <div className="filters">
          <LocationSelect locations={session.locations} value={locationId} onChange={setLocationId} placeholder="All locations" />
          <div className="grow">
            <ItemPicker items={session.items} value={itemId} onChange={setItemId} categories={['finished_cable']} placeholder="All cables" />
          </div>
          <input type="search" placeholder="Bobbin number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Bobbin number" />
          <label className="checkbox">
            <input type="checkbox" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} />
            Include empty
          </label>
        </div>
        {itemId && (
          <p className="sub" style={{ marginTop: -6, marginBottom: 12 }}>
            <button type="button" className="link-btn" onClick={() => setItemId('')}>
              Clear cable filter
            </button>
          </p>
        )}
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No bobbins match.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bobbin</th>
                  <th>Cable</th>
                  <th>Location</th>
                  <th className="num">Remaining</th>
                  <th className="num">Original</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.bobbin_id} className="clickable" onClick={() => go(`bobbin/${b.bobbin_id}`)}>
                    <td className="mono">{b.bobbin_no}</td>
                    <td className="wrap">{b.item_name}</td>
                    <td>{b.location_name}</td>
                    <td className="mono num">{formatQty(b.remaining_ft, 'ft')}</td>
                    <td className="mono num">{formatQty(b.original_ft, 'ft')}</td>
                    <td>
                      {b.remaining_ft === 0 ? (
                        <span className="tag muted">Empty</span>
                      ) : b.opened ? (
                        <span className="tag brand">Opened</span>
                      ) : (
                        <span className="tag ok">Full</span>
                      )}
                    </td>
                    <td className="mono sub">{b.production_order_id ? b.production_order_id.slice(0, 8) : 'Purchased / other'}</td>
                    <td className="mono">{formatDate(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="table-note">
            {rows.length} bobbins · {formatQty(totalFt, 'ft')} in total
          </p>
        )}
      </div>
    </>
  );
}

export default BobbinsPage;
