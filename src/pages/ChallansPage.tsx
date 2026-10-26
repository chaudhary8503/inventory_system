import { useState } from 'react';
import { listChallans } from '../api';
import { Banner, Empty, Loading, LocationSelect } from '../components/Common';
import { daysAgo, formatDate, formatDateTime, todayKarachi } from '../format';
import { useAsync } from '../hooks';
import { go, href } from '../router';
import type { Session } from '../session';

/** Every delivery challan, newest first, with reprint. */
function ChallansPage({ session }: { session: Session }) {
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(todayKarachi());
  const [locationId, setLocationId] = useState('');
  const { data, error, loading } = useAsync(() => listChallans(from, to, locationId || null), [from, to, locationId]);
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Delivery challans</h1>
          <p className="page-sub">One challan per transfer between locations. Open one to print it again.</p>
        </div>
        {session.can('record_transfer') && (
          <a className="btn btn-primary" href={href('transfer')}>
            New transfer
          </a>
        )}
      </div>
      <div className="card">
        <div className="filters">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={to} max={todayKarachi()} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <LocationSelect locations={session.locations} value={locationId} onChange={setLocationId} placeholder="All locations" />
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No challans in this range.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Challan</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="num">Lines</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Entered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.document_id} className="clickable" onClick={() => go(`challan/${c.document_id}`)}>
                    <td className="mono">{c.challan_no}</td>
                    <td className="mono">{formatDate(c.transfer_date)}</td>
                    <td>{c.from_location}</td>
                    <td>{c.to_location}</td>
                    <td className="mono num">{c.line_count}</td>
                    <td>{c.vehicle_no ?? '—'}</td>
                    <td>{c.cancelled ? <span className="tag muted">Cancelled</span> : <span className="tag ok">Sent</span>}</td>
                    <td className="sub">{formatDateTime(c.created_at)}</td>
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

export default ChallansPage;
