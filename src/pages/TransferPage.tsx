import { useState, type FormEvent } from 'react';
import { recordTransfer, stockAvailability, type Bobbin } from '../api';
import { Banner, BobbinSelect, LocationSelect, QuantityInput } from '../components/Common';
import ItemPicker from '../components/ItemPicker';
import { formatQty, todayKarachi } from '../format';
import { useAction, useAsync } from '../hooks';
import { itemById, locationName, type Session } from '../session';
import { conversionHint, toBase } from '../units';

/** Move stock between locations. Cable moves by bobbin: whole, or a cut length. */
function TransferPage({ session, query }: { session: Session; query: URLSearchParams }) {
  const allowed = session.stockLocationIds;
  const [itemId, setItemId] = useState(query.get('item') ?? '');
  const [fromId, setFromId] = useState(() => {
    const q = query.get('from');
    return q && allowed.includes(q) ? q : allowed.length === 1 ? allowed[0] : '';
  });
  const [toId, setToId] = useState('');
  const [bobbin, setBobbin] = useState<Bobbin | undefined>();
  const [whole, setWhole] = useState(true);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKarachi());
  const [refresh, setRefresh] = useState(0);
  const action = useAction();

  const item = itemById(session, itemId);
  const isCable = item?.category === 'finished_cable';
  const activeUnit = unit || item?.base_unit || '';
  const base = toBase(item, amount, activeUnit);

  const available = useAsync(
    () => (itemId ? stockAvailability([itemId]) : Promise.resolve([])),
    [itemId, refresh],
  );
  const atFrom = available.data?.find((a) => a.location_id === fromId)?.quantity;

  let quantity: number | null = null;
  let problem: string | null = null;
  if (isCable) {
    if (bobbin) {
      if (whole) quantity = bobbin.remaining_ft;
      else if (base !== null) {
        quantity = base;
        if (base <= 0) problem = 'Enter a length greater than 0.';
        else if (base > bobbin.remaining_ft) problem = `Bobbin ${bobbin.bobbin_no} only has ${formatQty(bobbin.remaining_ft, 'ft')}.`;
      }
    }
  } else if (base !== null) {
    quantity = base;
    if (base <= 0) problem = 'Enter an amount greater than 0.';
    else if (atFrom !== undefined && base > atFrom) problem = `Only ${formatQty(atFrom, item?.base_unit)} at ${locationName(session, fromId)}.`;
  }
  if (fromId && toId && fromId === toId) problem = 'Choose two different locations.';

  const ready = item && fromId && toId && quantity !== null && quantity > 0 && (!isCable || bobbin) && !problem;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !item || quantity === null) return;
    const ok = await action.run(async () => {
      await recordTransfer({
        itemId: item.item_id,
        fromId,
        toId,
        quantity: isCable && whole ? null : quantity,
        note: note.trim() || null,
        bobbinId: bobbin?.bobbin_id ?? null,
        date: date === todayKarachi() ? null : date,
      });
      const what = isCable
        ? whole
          ? `bobbin ${bobbin!.bobbin_no} (${formatQty(quantity, 'ft')})`
          : `${formatQty(quantity, 'ft')} cut from bobbin ${bobbin!.bobbin_no}`
        : formatQty(quantity, item.base_unit);
      return `Transferred ${what} of ${item.name} from ${locationName(session, fromId)} to ${locationName(session, toId)}.`;
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
        <h1 className="page-title">Transfer stock</h1>
        <Banner kind="info">No locations are assigned to you for sending stock. Ask the owner to assign your shop.</Banner>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">Transfer stock</h1>
      <p className="page-sub">
        Move stock from one of your locations to any other. Moving part of a bobbin cuts a new numbered piece at the destination.
      </p>
      <div className="card">
        <Banner kind="ok">{action.done}</Banner>
        <Banner kind="error">{action.error}</Banner>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="tr-item">Item</label>
              <ItemPicker
                id="tr-item"
                items={session.items}
                value={itemId}
                onChange={(id) => {
                  setItemId(id);
                  setUnit('');
                  setBobbin(undefined);
                  action.clear();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="tr-from">From</label>
              <LocationSelect
                id="tr-from"
                locations={session.locations}
                allowedIds={allowed}
                value={fromId}
                onChange={(id) => {
                  setFromId(id);
                  setBobbin(undefined);
                }}
              />
              {item && fromId && atFrom !== undefined && (
                <div className="hint">Available there: {formatQty(atFrom, item.base_unit)}</div>
              )}
            </div>
            <div className="field">
              <label htmlFor="tr-to">To</label>
              <LocationSelect id="tr-to" locations={session.locations} value={toId} onChange={setToId} exclude={fromId} />
            </div>

            {isCable ? (
              <>
                <div className="field span-2">
                  <label htmlFor="tr-bobbin">Bobbin</label>
                  <BobbinSelect id="tr-bobbin" itemId={itemId} locationId={fromId} value={bobbin?.bobbin_id ?? ''} onChange={setBobbin} refreshKey={refresh} />
                </div>
                <div className="field">
                  <span className="label">How much</span>
                  <label className="checkbox">
                    <input type="radio" name="tr-whole" checked={whole} onChange={() => setWhole(true)} />
                    Whole bobbin{bobbin ? ` (${formatQty(bobbin.remaining_ft, 'ft')})` : ''}
                  </label>
                  <br />
                  <label className="checkbox">
                    <input type="radio" name="tr-whole" checked={!whole} onChange={() => setWhole(false)} />
                    Cut a length
                  </label>
                </div>
                {!whole && (
                  <div className="field">
                    <label htmlFor="tr-qty">Length</label>
                    <QuantityInput id="tr-qty" item={item} amount={amount} unit={activeUnit} onAmount={setAmount} onUnit={setUnit} />
                    <div className="hint">{conversionHint(item, amount, activeUnit)}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="field">
                <label htmlFor="tr-qty">Amount</label>
                <QuantityInput id="tr-qty" item={item} amount={amount} unit={activeUnit} onAmount={setAmount} onUnit={setUnit} />
                <div className="hint">{conversionHint(item, amount, activeUnit)}</div>
              </div>
            )}

            <div className="field">
              <label htmlFor="tr-date">Date</label>
              <input id="tr-date" type="date" value={date} max={todayKarachi()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="tr-note">Note</label>
              <input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. van number" />
            </div>
          </div>
          {problem && <Banner kind="error">{problem}</Banner>}
          <button type="submit" className="btn btn-primary" disabled={!ready || action.busy}>
            {action.busy ? 'Saving…' : 'Record transfer'}
          </button>
        </form>
      </div>
    </>
  );
}

export default TransferPage;
