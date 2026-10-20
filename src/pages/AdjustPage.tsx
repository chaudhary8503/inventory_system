import { useState, type FormEvent } from 'react';
import { adjustStock, type Bobbin } from '../api';
import { Banner, BobbinSelect, LocationSelect, QuantityInput } from '../components/Common';
import ItemPicker from '../components/ItemPicker';
import { formatQty, formatSigned, todayKarachi } from '../format';
import { useAction } from '../hooks';
import { href } from '../router';
import { itemById, locationName, type Session } from '../session';
import { conversionHint, toBase } from '../units';

const REASONS = ['Count correction', 'Damaged', 'Sample given', 'Found in stock count', 'Theft / loss'];

/** Stock count correction at one of the person's own locations. */
function AdjustPage({ session, query }: { session: Session; query: URLSearchParams }) {
  const allowed = session.stockLocationIds;
  const [itemId, setItemId] = useState(query.get('item') ?? '');
  const [locationId, setLocationId] = useState(() => {
    const q = query.get('location');
    return q && allowed.includes(q) ? q : allowed.length === 1 ? allowed[0] : '';
  });
  const [direction, setDirection] = useState<'add' | 'remove'>('remove');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [bobbin, setBobbin] = useState<Bobbin | undefined>();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKarachi());
  const [refresh, setRefresh] = useState(0);
  const action = useAction();

  const item = itemById(session, itemId);
  const isCable = item?.category === 'finished_cable';
  const activeUnit = unit || item?.base_unit || '';
  const base = toBase(item, amount, activeUnit);

  const chooseItem = (id: string) => {
    setItemId(id);
    setUnit('');
    setBobbin(undefined);
    action.clear();
  };

  let problem: string | null = null;
  if (base !== null && base <= 0) problem = 'Enter an amount greater than 0.';
  else if (isCable && direction === 'remove' && !bobbin) problem = 'Choose the bobbin to reduce.';
  else if (isCable && direction === 'remove' && bobbin && base !== null && base > bobbin.remaining_ft)
    problem = `Bobbin ${bobbin.bobbin_no} only has ${formatQty(bobbin.remaining_ft, 'ft')}.`;

  const ready = item && locationId && base !== null && base > 0 && reason.trim() && !problem;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !item || base === null) return;
    const signed = direction === 'add' ? base : -base;
    const ok = await action.run(async () => {
      await adjustStock({
        itemId: item.item_id,
        locationId,
        quantity: signed,
        reason: reason.trim(),
        note: note.trim() || null,
        bobbinId: isCable ? (bobbin?.bobbin_id ?? null) : null,
        date: date === todayKarachi() ? null : date,
      });
      return `Adjusted ${item.name} at ${locationName(session, locationId)} by ${formatSigned(signed, item.base_unit)}${
        isCable && direction === 'add' && !bobbin ? ' (new bobbin created, cost pending)' : ''
      }.`;
    });
    if (ok) {
      setAmount('');
      setNote('');
      setBobbin(undefined);
      setRefresh((r) => r + 1);
    }
  };

  if (allowed.length === 0) {
    return (
      <div className="card">
        <h1 className="page-title">Adjust stock</h1>
        <Banner kind="info">No locations are assigned to you for changing stock. Ask the owner to assign your shop.</Banner>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">Adjust stock</h1>
      <p className="page-sub">Correct stock after a count, with a reason. Only at locations assigned to you.</p>
      <div className="card">
        <Banner kind="ok">{action.done}</Banner>
        <Banner kind="error">{action.error}</Banner>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="adj-item">Item</label>
              <ItemPicker id="adj-item" items={session.items} value={itemId} onChange={chooseItem} />
            </div>
            <div className="field">
              <label htmlFor="adj-location">Location</label>
              <LocationSelect
                id="adj-location"
                locations={session.locations}
                allowedIds={allowed}
                value={locationId}
                onChange={(id) => {
                  setLocationId(id);
                  setBobbin(undefined);
                }}
              />
            </div>
            <div className="field">
              <span className="label">Change</span>
              <div className="inline-input">
                <select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')} aria-label="Add or remove">
                  <option value="remove">Remove (less than recorded)</option>
                  <option value="add">Add (more than recorded)</option>
                </select>
              </div>
            </div>
            {isCable && (
              <div className="field span-2">
                <label htmlFor="adj-bobbin">Bobbin</label>
                <BobbinSelect
                  id="adj-bobbin"
                  itemId={itemId}
                  locationId={locationId}
                  value={bobbin?.bobbin_id ?? ''}
                  onChange={setBobbin}
                  refreshKey={refresh}
                  emptyLabel={direction === 'add' ? 'New bobbin (found cable)' : 'Choose a bobbin'}
                />
                <div className="hint">
                  {direction === 'add'
                    ? 'Leave empty to record found cable as a new bobbin, or choose the bobbin it belongs to.'
                    : 'Cable is reduced on a specific bobbin.'}
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="adj-qty">Amount</label>
              <QuantityInput id="adj-qty" item={item} amount={amount} unit={activeUnit} onAmount={setAmount} onUnit={setUnit} />
              <div className="hint">{conversionHint(item, amount, activeUnit)}</div>
            </div>
            <div className="field">
              <label htmlFor="adj-date">Date</label>
              <input id="adj-date" type="date" value={date} max={todayKarachi()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="adj-reason">Reason (required)</label>
              <input id="adj-reason" list="adj-reasons" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Count correction" />
              <datalist id="adj-reasons">
                {REASONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="adj-note">Note</label>
              <input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {problem && <Banner kind="error">{problem}</Banner>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
              {action.busy ? 'Saving…' : 'Record adjustment'}
            </button>
            {item && (
              <a href={href(`item/${item.item_id}`, { location: locationId })} className="sub">
                View this item's stock →
              </a>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

export default AdjustPage;
