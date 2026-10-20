import { useState } from 'react';
import { bobbinNumbers, listMovements, requestReversal, reversedIds, type Movement } from '../api';
import { Banner, Empty, Loading, LocationSelect } from '../components/Common';
import ItemPicker from '../components/ItemPicker';
import { daysAgo, formatDate, formatDateTime, formatQty, formatSigned, MOVEMENT_LABELS, todayKarachi } from '../format';
import { useAction, useAsync } from '../hooks';
import { href } from '../router';
import { itemById, locationName, type Session } from '../session';

const INVENTORY_SOURCES = ['inventory_adjustment', 'inventory_transfer', 'inventory_opening'];

interface MovementsPageProps {
  session: Session;
  movementId: string | undefined;
  query: URLSearchParams;
}

/** The stock ledger. Inventory's own entries can be reversed here; others are cancelled in their module. */
function MovementsPage({ session, movementId, query }: MovementsPageProps) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayKarachi());
  const [type, setType] = useState('');
  const [locationId, setLocationId] = useState(query.get('location') ?? '');
  const [itemId, setItemId] = useState(query.get('item') ?? '');
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const action = useAction();

  const { data, error, loading, reload } = useAsync(async () => {
    const rows = movementId
      ? await listMovements({ id: movementId })
      : await listMovements({ from, to, type: type || undefined, locationId: locationId || undefined, itemId: itemId || undefined });
    const ids = rows.map((r) => r.id);
    const [reversed, numbers] = await Promise.all([
      reversedIds(ids),
      session.can('view_bobbins')
        ? bobbinNumbers([...new Set(rows.map((r) => r.bobbin_id).filter((x): x is string => !!x))])
        : Promise.resolve({} as Record<string, string>),
    ]);
    return { rows, reversed, numbers };
  }, [movementId, from, to, type, locationId, itemId]);

  const canReverse = (m: Movement) =>
    session.can('reverse_movements') &&
    INVENTORY_SOURCES.includes(m.source_type) &&
    m.movement_type !== 'reversal' &&
    !data?.reversed.has(m.id) &&
    session.stockLocationIds.includes(m.location_id);

  const submitReversal = async (m: Movement) => {
    const ok = await action.run(async () => {
      if (!reason.trim()) throw new Error('Give a reason for the reversal.');
      await requestReversal(m.id, reason.trim());
      return `Reversed: ${MOVEMENT_LABELS[m.movement_type] ?? m.movement_type} of ${itemById(session, m.item_id)?.name ?? 'item'}.`;
    });
    if (ok) {
      setReversing(null);
      setReason('');
      reload();
    }
  };

  const rows = data?.rows ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Movements</h1>
          <p className="page-sub">
            Every change to stock, newest first. Entries are never edited: a mistake is corrected with a reversal.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>

      <div className="card">
        {movementId ? (
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Showing one movement. <a href={href('movements')}>Show all movements</a>
          </p>
        ) : (
          <div className="filters">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={to} max={todayKarachi()} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Movement type">
              <option value="">All types</option>
              {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <LocationSelect locations={session.locations} value={locationId} onChange={setLocationId} placeholder="All locations" />
            <div className="grow">
              <ItemPicker items={session.items} value={itemId} onChange={setItemId} placeholder="All items" />
            </div>
            {itemId && (
              <button type="button" className="btn btn-secondary" onClick={() => setItemId('')}>
                Clear item
              </button>
            )}
          </div>
        )}

        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No movements in this range.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th className="num">Change</th>
                  <th className="num">Balance after</th>
                  <th>Bobbin</th>
                  <th>Reason / note</th>
                  <th>Entered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const item = itemById(session, m.item_id);
                  const isReversed = data!.reversed.has(m.id);
                  return (
                    <tr key={m.id} className={m.id === movementId ? 'highlighted' : undefined}>
                      <td className="mono">{formatDate(m.movement_date)}</td>
                      <td className="wrap">
                        {item ? <a href={href(`item/${item.item_id}`)}>{item.name}</a> : '—'}
                      </td>
                      <td>{locationName(session, m.location_id)}</td>
                      <td>
                        {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}
                        {isReversed && (
                          <>
                            {' '}
                            <span className="tag muted">Reversed</span>
                          </>
                        )}
                      </td>
                      <td className={`mono num ${m.quantity > 0 ? 'pos' : 'neg'}`}>{formatSigned(m.quantity, item?.base_unit)}</td>
                      <td className="mono num">{formatQty(m.balance_after)}</td>
                      <td className="mono">
                        {m.bobbin_id && data!.numbers[m.bobbin_id] ? (
                          <a href={href(`bobbin/${m.bobbin_id}`)}>{data!.numbers[m.bobbin_id]}</a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="wrap">{[m.reason, m.note].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="sub">{formatDateTime(m.created_at)}</td>
                      <td className="num">
                        {reversing === m.id ? (
                          <span className="form-actions" style={{ justifyContent: 'flex-end' }}>
                            <input
                              type="text"
                              placeholder="Reason"
                              value={reason}
                              autoFocus
                              onChange={(e) => setReason(e.target.value)}
                              aria-label="Reason for reversal"
                              className="reason-input"
                            />
                            <button type="button" className="btn btn-danger btn-small" disabled={action.busy} onClick={() => void submitReversal(m)}>
                              Reverse
                            </button>
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => setReversing(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          canReverse(m) && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => {
                                setReversing(m.id);
                                setReason('');
                                action.clear();
                              }}
                            >
                              Reverse
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="table-note">
            {rows.length} movements{rows.length >= 300 ? ' (first 300 — narrow the dates to see more)' : ''}. Sales,
            production and supplier entries are cancelled from their own module.
          </p>
        )}
      </div>
    </>
  );
}

export default MovementsPage;
