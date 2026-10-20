import { useState } from 'react';
import { balances, bobbinNumbers, itemCosts, listBobbins, listMovements, setReorderLevel, stockAvailability } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import {
  CATEGORY_LABELS,
  formatDate,
  formatMoney,
  formatQty,
  formatSigned,
  formatUnitCost,
  MOVEMENT_LABELS,
} from '../format';
import { useAction, useAsync } from '../hooks';
import { go, href } from '../router';
import { itemById, locationName, type Session } from '../session';

interface ItemPageProps {
  session: Session;
  itemId: string | undefined;
  focusLocation: string | null;
}

function ItemPage({ session, itemId, focusLocation }: ItemPageProps) {
  const item = itemById(session, itemId);
  const { can } = session;
  const isCable = item?.category === 'finished_cable';

  const stock = useAsync(
    () => (itemId ? Promise.all([stockAvailability([itemId]), can('view_stock') ? balances(itemId) : Promise.resolve([])]) : Promise.resolve(null)),
    [itemId],
  );
  const costs = useAsync(() => (itemId && can('view_costs') ? itemCosts([itemId]) : Promise.resolve([])), [itemId]);
  const bobbins = useAsync(
    () => (itemId && isCable && can('view_bobbins') ? listBobbins(itemId, null, false) : Promise.resolve([])),
    [itemId, isCable],
  );
  const movements = useAsync(async () => {
    if (!itemId || !can('view_movements')) return null;
    const rows = await listMovements({ itemId, limit: 60 });
    const numbers = await bobbinNumbers([...new Set(rows.map((r) => r.bobbin_id).filter((x): x is string => !!x))]);
    return { rows, numbers };
  }, [itemId]);

  if (!item) {
    return (
      <div className="card">
        <h1 className="page-title">Item not found</h1>
        <p className="page-sub">
          It may have been removed from your list. <a href={href('stock')}>Back to stock</a>
        </p>
      </div>
    );
  }

  const [avail, bal] = stock.data ?? [[], []];
  const reorderMap = new Map(bal.map((b) => [b.location_id, b.reorder_level]));
  const total = avail.reduce((s, a) => s + a.quantity, 0);
  const cost = costs.data?.[0];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub">
            <a href={href('stock')}>Stock</a> / {CATEGORY_LABELS[item.category]}
          </p>
          <h1 className="page-title">{item.name}</h1>
          <p className="page-sub">
            {CATEGORY_LABELS[item.category]} · stocked in {item.base_unit}
            {item.code ? ` · code ${item.code}` : ''}
            {!item.active ? ' · inactive' : ''}
          </p>
        </div>
        <div className="form-actions">
          {can('adjust_stock') && (
            <a className="btn btn-secondary" href={href('adjust', { item: item.item_id, location: focusLocation })}>
              Adjust
            </a>
          )}
          {can('record_transfer') && (
            <a className="btn btn-secondary" href={href('transfer', { item: item.item_id, from: focusLocation })}>
              Transfer
            </a>
          )}
          {(can('manage_items') || can('edit_standard_cost')) && (
            <a className="btn btn-secondary" href={href(`items/${item.item_id}`)}>
              Edit item
            </a>
          )}
        </div>
      </div>

      <div className="facts">
        <div className="fact">
          <div className="fact-label">Total stock</div>
          <div className="fact-value mono">{stock.data ? formatQty(total, item.base_unit) : '…'}</div>
        </div>
        {item.units.length > 1 && (
          <div className="fact">
            <div className="fact-label">Units</div>
            <div className="fact-value" style={{ fontSize: 14 }}>
              {item.units
                .filter((u) => u.unit !== item.base_unit)
                .map((u) => `1 ${u.unit} = ${formatQty(u.factor_to_base, item.base_unit)}`)
                .join(' · ')}
            </div>
          </div>
        )}
        {cost && (
          <>
            <div className="fact">
              <div className="fact-label">{isCable ? 'Standard cost (for cost-pending bobbins)' : 'Average cost'}</div>
              <div className="fact-value mono">
                {isCable
                  ? cost.standard_cost === null
                    ? 'Not set'
                    : formatUnitCost(cost.standard_cost, item.base_unit)
                  : formatUnitCost(cost.avg_unit_cost, item.base_unit)}
              </div>
            </div>
            {!isCable && (
              <div className="fact">
                <div className="fact-label">Stock value</div>
                <div className="fact-value mono">{formatMoney(total * cost.avg_unit_cost)}</div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="stack">
        <LocationsCard
          session={session}
          itemId={item.item_id}
          unit={item.base_unit}
          rows={avail.map((a) => ({ locationId: a.location_id, name: a.location_name, qty: a.quantity, reorder: reorderMap.get(a.location_id) ?? null }))}
          loading={stock.loading && !stock.data}
          error={stock.error}
          focusLocation={focusLocation}
          onSaved={stock.reload}
        />

        {isCable && can('view_bobbins') && (
          <div className="card">
            <div className="section-title">Bobbins</div>
            {bobbins.error && <Banner kind="error">{bobbins.error}</Banner>}
            {bobbins.loading && !bobbins.data ? (
              <Loading />
            ) : (bobbins.data ?? []).length === 0 ? (
              <Empty>No bobbins with cable left.</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Bobbin</th>
                      <th>Location</th>
                      <th className="num">Remaining</th>
                      <th className="num">Original</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bobbins.data ?? []).map((b) => (
                      <tr
                        key={b.bobbin_id}
                        className={`clickable${b.location_id === focusLocation ? ' highlighted' : ''}`}
                        onClick={() => go(`bobbin/${b.bobbin_id}`)}
                      >
                        <td className="mono">{b.bobbin_no}</td>
                        <td>{b.location_name}</td>
                        <td className="mono num">{formatQty(b.remaining_ft, 'ft')}</td>
                        <td className="mono num">{formatQty(b.original_ft, 'ft')}</td>
                        <td>{b.opened ? <span className="tag brand">Opened</span> : <span className="tag muted">Full</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {can('view_movements') && (
          <div className="card">
            <div className="page-head">
              <div className="section-title">Recent movements</div>
              <a href={href('movements', { item: item.item_id })} className="sub">
                Full history →
              </a>
            </div>
            {movements.error && <Banner kind="error">{movements.error}</Banner>}
            {movements.loading && !movements.data ? (
              <Loading />
            ) : (movements.data?.rows ?? []).length === 0 ? (
              <Empty>No movements yet.</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Location</th>
                      {isCable && <th>Bobbin</th>}
                      <th className="num">Change</th>
                      <th className="num">Balance after</th>
                      <th>Reason / note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.data!.rows.map((m) => (
                      <tr key={m.id} className="clickable" onClick={() => go(`movements/${m.id}`)}>
                        <td className="mono">{formatDate(m.movement_date)}</td>
                        <td>{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                        <td>{locationName(session, m.location_id)}</td>
                        {isCable && <td className="mono">{m.bobbin_id ? (movements.data!.numbers[m.bobbin_id] ?? '—') : '—'}</td>}
                        <td className={`mono num ${m.quantity > 0 ? 'pos' : 'neg'}`}>{formatSigned(m.quantity, item.base_unit)}</td>
                        <td className="mono num">{formatQty(m.balance_after)}</td>
                        <td className="wrap">{[m.reason, m.note].filter(Boolean).join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface LocationRow {
  locationId: string;
  name: string;
  qty: number;
  reorder: number | null;
}

function LocationsCard({
  session,
  itemId,
  unit,
  rows,
  loading,
  error,
  focusLocation,
  onSaved,
}: {
  session: Session;
  itemId: string;
  unit: string;
  rows: LocationRow[];
  loading: boolean;
  error: string | null;
  focusLocation: string | null;
  onSaved: () => void;
}) {
  const canEdit = session.can('set_reorder_levels');
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const action = useAction();

  const save = async (locationId: string) => {
    const ok = await action.run(async () => {
      const level = value.trim() === '' ? null : Number(value);
      if (level !== null && (!Number.isFinite(level) || level < 0)) throw new Error('Enter 0 or more, or leave it blank to clear.');
      await setReorderLevel(itemId, locationId, level);
      return 'Reorder level saved.';
    });
    if (ok) {
      setEditing(null);
      onSaved();
    }
  };

  return (
    <div className="card">
      <div className="section-title">Stock by location</div>
      {error && <Banner kind="error">{error}</Banner>}
      <Banner kind="error">{action.error}</Banner>
      <Banner kind="ok">{action.done}</Banner>
      {loading ? (
        <Loading />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th className="num">On hand</th>
                <th className="num">Reorder level</th>
                <th>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status =
                  r.reorder === null ? null : r.qty <= 0 ? 'out' : r.qty <= r.reorder ? 'low' : 'ok';
                return (
                  <tr key={r.locationId} className={r.locationId === focusLocation ? 'highlighted' : undefined}>
                    <td>{r.name}</td>
                    <td className="mono num">{formatQty(r.qty, unit)}</td>
                    <td className="mono num">
                      {editing === r.locationId ? (
                        <input
                          className="reorder-input"
                          type="number"
                          min={0}
                          step="any"
                          value={value}
                          autoFocus
                          aria-label={`Reorder level at ${r.name}`}
                          onChange={(e) => setValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void save(r.locationId);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        formatQty(r.reorder, unit)
                      )}
                    </td>
                    <td>
                      {status === 'out' && <span className="tag out">Out of stock</span>}
                      {status === 'low' && <span className="tag low">Low</span>}
                      {status === 'ok' && <span className="tag ok">OK</span>}
                      {status === null && <span className="sub">No level set</span>}
                    </td>
                    {canEdit && (
                      <td className="num">
                        {editing === r.locationId ? (
                          <span className="form-actions" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-primary btn-small" disabled={action.busy} onClick={() => void save(r.locationId)}>
                              Save
                            </button>
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setEditing(r.locationId);
                              setValue(r.reorder === null ? '' : String(r.reorder));
                              action.clear();
                            }}
                          >
                            Set level
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ItemPage;
