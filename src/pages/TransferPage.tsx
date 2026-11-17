import { useState, type FormEvent } from 'react';
import { recordTransferDocument, stockAvailability, type Bundle, type TransferLine } from '../api';
import { Banner, BundleSelect, LocationSelect, QuantityInput } from '../components/Common';
import ItemPicker from '../components/ItemPicker';
import { formatQty, todayKarachi } from '../format';
import { useAction, useAsync } from '../hooks';
import { go } from '../router';
import { itemById, type Session } from '../session';
import { conversionHint, defaultUnit, toBase } from '../units';

interface DraftLine {
  key: number;
  itemId: string;
  bundle?: Bundle;
  whole: boolean;
  /** Amount for non-cable items. */
  amount: string;
  /** Cable cut from a bundle: one length per piece, all in `unit`. */
  pieces: string[];
  unit: string;
}

let nextKey = 1;
const newLine = (itemId = ''): DraftLine => ({ key: nextKey++, itemId, whole: true, amount: '', pieces: [''], unit: '' });

/**
 * A delivery challan: several lines from one location to another. Cable moves
 * by bundle: the whole bundle, or one or more cut pieces (each piece becomes
 * its own numbered bundle at the destination). Saving prints the challan.
 */
function TransferPage({ session, query }: { session: Session; query: URLSearchParams }) {
  const allowed = session.stockLocationIds;
  const [fromId, setFromId] = useState(() => {
    const q = query.get('from');
    return q && allowed.includes(q) ? q : allowed.length === 1 ? allowed[0] : '';
  });
  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine(query.get('item') ?? '')]);
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKarachi());
  const action = useAction();

  const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  const available = useAsync(() => (itemIds.length ? stockAvailability(itemIds) : Promise.resolve([])), [itemIds.join(',')]);
  const atFrom = (itemId: string) => available.data?.find((a) => a.item_id === itemId && a.location_id === fromId)?.quantity;

  const update = (key: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Work out each line's quantity and problems.
  const checked = lines.map((l) => {
    const item = itemById(session, l.itemId);
    const isCable = item?.category === 'finished_cable';
    const unit = l.unit || defaultUnit(item);
    let quantity: number | null = null;
    /** Cut pieces in feet (cable, "Cut lengths" only). */
    let pieces: (number | null)[] = [];
    let problem: string | null = null;
    if (!item) return { l, item, isCable, unit, quantity, pieces, problem: null as string | null, empty: true };
    if (isCable) {
      pieces = l.whole ? [] : l.pieces.map((p) => toBase(item, p, unit));
      if (!l.bundle) problem = 'Choose the bundle.';
      else if (l.whole) quantity = l.bundle.remaining_ft;
      else {
        quantity = Math.round(pieces.reduce<number>((sum, p) => sum + (p ?? 0), 0) * 1000) / 1000;
        if (pieces.some((p) => p === null || p <= 0)) problem = 'Enter a length greater than 0 for every piece.';
        else if (quantity > l.bundle.remaining_ft)
          problem = `The pieces add up to ${formatQty(quantity, 'ft')}, but bundle ${l.bundle.bundle_no} only has ${formatQty(l.bundle.remaining_ft, 'ft')}.`;
      }
    } else {
      quantity = toBase(item, l.amount, unit);
      const have = atFrom(item.item_id);
      if (quantity === null || quantity <= 0) problem = 'Enter an amount greater than 0.';
      else if (have !== undefined && quantity > have) problem = `Only ${formatQty(have, item.base_unit)} here.`;
    }
    return { l, item, isCable, unit, quantity, pieces, problem, empty: false };
  });
  const filled = checked.filter((c) => !c.empty);
  const sameBundleTwice = new Set(filled.map((c) => c.l.bundle?.bundle_id).filter(Boolean)).size !==
    filled.filter((c) => c.l.bundle).length;
  const ready = fromId && toId && fromId !== toId && filled.length > 0 && filled.every((c) => !c.problem) && !sameBundleTwice;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    // One challan line per cut piece; the database cuts them from the bundle one by one.
    const payload: TransferLine[] = filled.flatMap((c): TransferLine[] => {
      if (!c.isCable) return [{ item_id: c.l.itemId, quantity: c.quantity, bundle_id: null }];
      const bundleId = c.l.bundle?.bundle_id ?? null;
      if (c.l.whole) return [{ item_id: c.l.itemId, quantity: null, bundle_id: bundleId }];
      return c.pieces.map((p) => ({ item_id: c.l.itemId, quantity: p, bundle_id: bundleId }));
    });
    let docId = '';
    const ok = await action.run(async () => {
      docId = await recordTransferDocument({
        fromId,
        toId,
        lines: payload,
        vehicleNo: vehicle.trim() || null,
        driverName: driver.trim() || null,
        note: note.trim() || null,
        date: date === todayKarachi() ? null : date,
      });
    });
    if (ok && docId) go(`challan/${docId}`, { print: '1' });
  };

  if (allowed.length === 0) {
    return (
      <div className="card">
        <h1 className="page-title">Transfer stock</h1>
        <Banner kind="info">No locations are assigned to you for sending stock. Ask the owner to assign your location.</Banner>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">Transfer stock</h1>
      <p className="page-sub">
        Send stock from one of your locations to another. Each transfer gets a numbered delivery challan to print. Moving part
        of a bundle cuts a new numbered piece at the destination.
      </p>
      <form onSubmit={submit} noValidate className="stack">
        <div className="card">
          <Banner kind="error">{action.error}</Banner>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="tr-from">From</label>
              <LocationSelect
                id="tr-from"
                locations={session.locations}
                allowedIds={allowed}
                value={fromId}
                onChange={(id) => {
                  setFromId(id);
                  setLines((ls) => ls.map((l) => ({ ...l, bundle: undefined })));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="tr-to">To</label>
              <LocationSelect id="tr-to" locations={session.locations} value={toId} onChange={setToId} exclude={fromId} />
            </div>
            <div className="field">
              <label htmlFor="tr-vehicle">Vehicle number (optional)</label>
              <input id="tr-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. LES-1234" />
            </div>
            <div className="field">
              <label htmlFor="tr-driver">Driver name (optional)</label>
              <input id="tr-driver" value={driver} onChange={(e) => setDriver(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tr-date">Date</label>
              <input id="tr-date" type="date" value={date} max={todayKarachi()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tr-note">Note (optional)</label>
              <input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Items</div>
          {checked.map((c, i) => (
            <div className="transfer-line" key={c.l.key}>
              <div className="transfer-line-head">
                <span className="sub">Line {i + 1}</span>
                {lines.length > 1 && (
                  <button type="button" className="link-btn" onClick={() => setLines((ls) => ls.filter((l) => l.key !== c.l.key))}>
                    Remove
                  </button>
                )}
              </div>
              <div className="form-grid">
                <div className="field span-2">
                  <label htmlFor={`tr-item-${c.l.key}`}>Item</label>
                  <ItemPicker
                    id={`tr-item-${c.l.key}`}
                    items={session.items}
                    value={c.l.itemId}
                    onChange={(id) => update(c.l.key, { itemId: id, bundle: undefined, amount: '', unit: '' })}
                  />
                  {c.item && fromId && atFrom(c.item.item_id) !== undefined && (
                    <div className="hint">Available at the sending location: {formatQty(atFrom(c.item.item_id), c.item.base_unit)}</div>
                  )}
                </div>
                {c.isCable ? (
                  <>
                    <div className="field">
                      <label htmlFor={`tr-bundle-${c.l.key}`}>Bundle</label>
                      <BundleSelect
                        id={`tr-bundle-${c.l.key}`}
                        itemId={c.l.itemId}
                        locationId={fromId}
                        value={c.l.bundle?.bundle_id ?? ''}
                        onChange={(b) => update(c.l.key, { bundle: b })}
                      />
                    </div>
                    <div className="field">
                      <span className="label">How much</span>
                      <div className="inline-input">
                        <select
                          value={c.l.whole ? 'whole' : 'cut'}
                          onChange={(e) => update(c.l.key, { whole: e.target.value === 'whole' })}
                          aria-label="Whole bundle or a length"
                        >
                          <option value="whole">Whole bundle{c.l.bundle ? ` (${formatQty(c.l.bundle.remaining_ft, 'ft')})` : ''}</option>
                          <option value="cut">Cut lengths</option>
                        </select>
                      </div>
                      {!c.l.whole && (
                        <>
                          {c.l.pieces.map((p, pi) => (
                            <div className="cut-piece" key={pi}>
                              <span className="cut-piece-no sub">Piece {pi + 1}</span>
                              <QuantityInput
                                item={c.item}
                                amount={p}
                                unit={c.unit}
                                onAmount={(v) => update(c.l.key, { pieces: c.l.pieces.map((x, xi) => (xi === pi ? v : x)) })}
                                onUnit={(u) => update(c.l.key, { unit: u })}
                              />
                              {c.l.pieces.length > 1 && (
                                <button
                                  type="button"
                                  className="link-btn"
                                  aria-label={`Remove piece ${pi + 1}`}
                                  onClick={() => update(c.l.key, { pieces: c.l.pieces.filter((_, xi) => xi !== pi) })}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                          <div className="cut-piece-foot">
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => update(c.l.key, { pieces: [...c.l.pieces, ''] })}>
                              Add another piece
                            </button>
                            {c.l.bundle && (
                              <span className="hint">
                                {c.l.pieces.length} piece{c.l.pieces.length === 1 ? '' : 's'} · {formatQty(c.quantity ?? 0, 'ft')} of{' '}
                                {formatQty(c.l.bundle.remaining_ft, 'ft')} · {formatQty(Math.max(0, c.l.bundle.remaining_ft - (c.quantity ?? 0)), 'ft')} left on the bundle
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  c.item && (
                    <div className="field">
                      <label htmlFor={`tr-qty-${c.l.key}`}>Amount</label>
                      <QuantityInput
                        id={`tr-qty-${c.l.key}`}
                        item={c.item}
                        amount={c.l.amount}
                        unit={c.unit}
                        onAmount={(v) => update(c.l.key, { amount: v })}
                        onUnit={(u) => update(c.l.key, { unit: u })}
                      />
                      <div className="hint">{conversionHint(c.item, c.l.amount, c.unit)}</div>
                    </div>
                  )
                )}
              </div>
              {c.problem && c.l.itemId && <div className="field-problem">{c.problem}</div>}
            </div>
          ))}
          {sameBundleTwice && <Banner kind="error">The same bundle is on two lines. Add the extra lengths as pieces on one line instead.</Banner>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setLines((ls) => [...ls, newLine()])}>
              Add another item
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
              {action.busy ? 'Saving…' : 'Save and print challan'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

export default TransferPage;
