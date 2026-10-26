import { useState, type FormEvent } from 'react';
import { recordOpening } from '../api';
import { Banner, LocationSelect, QuantityInput } from '../components/Common';
import ItemPicker from '../components/ItemPicker';
import { formatQty, FT_PER_M, getLengthUnit, todayKarachi } from '../format';
import { useAction } from '../hooks';
import { itemById, locationName, type Session } from '../session';
import { conversionHint, defaultUnit, parseLengths, toBase } from '../units';

/**
 * Opening stock on the cut-over date, one item and location at a time.
 * (The spreadsheet importer for whole batches comes in stage 4.)
 */
function OpeningPage({ session }: { session: Session }) {
  const allowed = session.stockLocationIds;
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState(allowed.length === 1 ? allowed[0] : '');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [lengths, setLengths] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(todayKarachi());
  const [note, setNote] = useState('');
  const action = useAction();

  const item = itemById(session, itemId);
  const lengthUnit = getLengthUnit();
  const isCable = item?.category === 'finished_cable';
  const activeUnit = unit || defaultUnit(item);
  const base = toBase(item, amount, activeUnit);
  // Bundle lengths are typed in the person's unit (ft or m) and stored in feet.
  const typed = isCable ? parseLengths(lengths) : null;
  const parsed = typed && lengthUnit === 'm' ? typed.map((v) => Math.round(v * FT_PER_M * 1000) / 1000) : typed;
  const cableTotal = parsed?.reduce((s, v) => s + v, 0) ?? 0;
  const costValue = cost.trim() === '' ? null : Number(cost);

  let problem: string | null = null;
  if (isCable && lengths.trim() && !parsed) problem = 'Bundle lengths must be numbers greater than 0, separated by commas or new lines.';
  if (!isCable && base !== null && base <= 0) problem = 'Enter an amount greater than 0.';
  if (costValue !== null && (!Number.isFinite(costValue) || costValue < 0)) problem = 'Cost must be 0 or more.';

  const ready = item && locationId && (isCable ? !!parsed : base !== null && base > 0) && !problem;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !item) return;
    const ok = await action.run(async () => {
      const rows = await recordOpening({
        itemId: item.item_id,
        locationId,
        quantity: isCable ? null : base,
        unitCost: costValue,
        date,
        note: note.trim() || null,
        bundles: isCable ? parsed!.map((l) => ({ length_ft: l })) : null,
      });
      const where = locationName(session, locationId);
      return isCable
        ? `Opening stock recorded: ${rows.length} bundle${rows.length === 1 ? '' : 's'} (${rows
            .map((r) => r.bundle_no)
            .join(', ')}) of ${item.name} at ${where}.`
        : `Opening stock recorded: ${formatQty(base, item.base_unit)} of ${item.name} at ${where}.`;
    });
    if (ok) {
      setAmount('');
      setLengths('');
      setCost('');
      setNote('');
    }
  };

  if (allowed.length === 0) {
    return (
      <div className="card">
        <h1 className="page-title">Opening stock</h1>
        <Banner kind="info">No locations are assigned to you. Ask the owner to assign them.</Banner>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">Opening stock</h1>
      <p className="page-sub">
        What is physically at each location on the cut-over date. Entered once per item and location; to correct it,
        reverse it on the Movements page and enter it again.
      </p>
      <div className="card">
        <Banner kind="ok">{action.done}</Banner>
        <Banner kind="error">{action.error}</Banner>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="op-item">Item</label>
              <ItemPicker
                id="op-item"
                items={session.items}
                value={itemId}
                onChange={(id) => {
                  setItemId(id);
                  setUnit('');
                  action.clear();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="op-location">Location</label>
              <LocationSelect id="op-location" locations={session.locations} allowedIds={allowed} value={locationId} onChange={setLocationId} />
            </div>
            <div className="field">
              <label htmlFor="op-date">Cut-over date</label>
              <input id="op-date" type="date" value={date} max={todayKarachi()} onChange={(e) => setDate(e.target.value)} />
            </div>
            {isCable ? (
              <div className="field span-2">
                <label htmlFor="op-lengths">Bundle lengths in {lengthUnit === 'm' ? 'metres' : 'feet'} (one bundle each)</label>
                <textarea
                  id="op-lengths"
                  value={lengths}
                  onChange={(e) => setLengths(e.target.value)}
                  placeholder={'e.g. 1000, 800, 1200\nIf the bundles are unknown, enter the total as one length.'}
                />
                <div className="hint">
                  {parsed ? `${parsed.length} bundle${parsed.length === 1 ? '' : 's'}, ${formatQty(cableTotal, 'ft')} in total` : ''}
                </div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="op-qty">Quantity</label>
                <QuantityInput id="op-qty" item={item} amount={amount} unit={activeUnit} onAmount={setAmount} onUnit={setUnit} />
                <div className="hint">{conversionHint(item, amount, activeUnit)}</div>
              </div>
            )}
            <div className="field">
              <label htmlFor="op-cost">Cost per {item?.base_unit ?? 'unit'} (Rs, optional)</label>
              <input id="op-cost" type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
              <div className="hint">
                {isCable
                  ? 'Leave blank if unknown: the bundles are valued at the standard cost until set.'
                  : 'Starts the weighted average cost. Leave blank to keep the current average.'}
              </div>
            </div>
            <div className="field span-2">
              <label htmlFor="op-note">Note</label>
              <input id="op-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. physical count by Ali" />
            </div>
          </div>
          {problem && <Banner kind="error">{problem}</Banner>}
          <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
            {action.busy ? 'Saving…' : 'Record opening stock'}
          </button>
        </form>
      </div>
    </>
  );
}

export default OpeningPage;
