import { useEffect, useMemo, useState } from 'react';
import { itemsWithOpening, managerKeyItems, recordOpening, type Item } from '../api';
import { Banner, Empty, LocationSelect } from '../components/Common';
import { formatQty, FT_PER_M, todayKarachi } from '../format';
import { useAction } from '../hooks';
import { parseDelimited } from '../import/managerParser';
import { href } from '../router';
import { locationName, type Session } from '../session';
import './ImportPage.css';

/*
  Opening stock from a Manager.io "Inventory Items" sheet (Item name + Qty owned).
  Rows are matched to items through the Manager.io keys saved by the item
  import (Setup → Import), converted to each item's base unit, and posted as
  one opening balance per item at the chosen location. Cable items get one
  bundle with the full length.
*/

/** How the sheet's quantities for cable (feet items) are measured. */
type SheetUnit = '' | 'ft' | 'm' | 'yd';
const FT_PER_YD = 3;

interface SheetRow {
  row: number;
  managerName: string;
  /** Quantity as written in the sheet. */
  sheetQty: number | null;
  itemId: string | null;
  /** Editable amount, starts as the sheet quantity. */
  amount: string;
  /** null = follow the sheet's length unit (feet items) or the item's base unit. */
  unit: string | null;
  include: boolean;
  /** Warnings worth a look; the row can still be imported. */
  flags: string[];
}

const QTY_HEADERS = ['qty owned', 'qty', 'quantity', 'qty on hand', 'quantity on hand', 'on hand'];
const NAME_HEADERS = ['item name', 'name', 'item'];

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Same tidy-up the item import applies before saving a Manager.io key. */
function managerKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function isFeetItem(item: Item | undefined): boolean {
  return item?.base_unit === 'ft';
}

/** Units a row can be counted in, with the factor to the item's base unit. */
function rowUnits(item: Item | undefined): { unit: string; factor: number }[] {
  if (!item) return [];
  const list = item.units.map((u) => ({ unit: u.unit, factor: u.factor_to_base }));
  if (isFeetItem(item)) {
    if (!list.some((u) => u.unit === 'm')) list.push({ unit: 'm', factor: FT_PER_M });
    if (!list.some((u) => u.unit === 'yd')) list.push({ unit: 'yd', factor: FT_PER_YD });
  }
  if (!list.some((u) => u.unit === item.base_unit)) list.unshift({ unit: item.base_unit, factor: 1 });
  return list;
}

function OpeningImportPage({ session }: { session: Session }) {
  const allowed = session.stockLocationIds;
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState(allowed.length === 1 ? allowed[0] : '');
  const [date, setDate] = useState(todayKarachi());
  const [sheetUnit, setSheetUnit] = useState<SheetUnit>('');
  const [view, setView] = useState<'import' | 'skipped' | 'all'>('import');
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const action = useAction();

  const itemMap = useMemo(() => new Map(session.items.map((i) => [i.item_id, i])), [session.items]);

  // Items that already have opening stock at the chosen location can't get another.
  useEffect(() => {
    if (!locationId) return;
    let live = true;
    itemsWithOpening(locationId)
      .then((s) => live && setExisting(s))
      .catch(() => live && setExisting(new Set()));
    return () => {
      live = false;
    };
  }, [locationId]);

  const load = async (table: string[][], name: string) => {
    setParseError(null);
    setFailures([]);
    action.clear();
    let headerRow = -1;
    let nameCol = -1;
    let qtyCol = -1;
    for (let r = 0; r < Math.min(table.length, 10) && headerRow < 0; r++) {
      const cells = table[r].map((c) => String(c ?? '').trim().toLowerCase());
      nameCol = cells.findIndex((c) => NAME_HEADERS.includes(c));
      qtyCol = cells.findIndex((c) => QTY_HEADERS.includes(c));
      if (nameCol >= 0 && qtyCol >= 0) headerRow = r;
    }
    if (headerRow < 0) {
      setParseError('Couldn\'t find the "Item name" and "Qty owned" column headers in the first rows.');
      return;
    }

    let keys: Map<string, string>;
    try {
      keys = await managerKeyItems();
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      return;
    }
    // Fall back to a case-insensitive match, and to the item's own key.
    const lowerKeys = new Map<string, string>();
    for (const [k, id] of keys) lowerKeys.set(k.toLowerCase(), id);
    for (const i of session.items) if (i.manager_key) lowerKeys.set(i.manager_key.toLowerCase(), i.item_id);

    const parsed: SheetRow[] = table.slice(headerRow + 1).map((cells, idx) => {
      const managerName = managerKey(String(cells[nameCol] ?? ''));
      const rawQty = String(cells[qtyCol] ?? '').replace(/,/g, '').trim();
      const sheetQty = rawQty === '' ? null : Number(rawQty);
      const itemId = managerName ? (keys.get(managerName) ?? lowerKeys.get(managerName.toLowerCase()) ?? null) : null;
      const item = itemId ? itemMap.get(itemId) : undefined;
      const flags: string[] = [];
      let unit: string | null = null;
      let include = true;

      if (item && sheetQty !== null && Number.isFinite(sheetQty) && sheetQty > 0) {
        if (/\bcoil\b/i.test(managerName)) {
          const coil = item.units.find((u) => /coil/i.test(u.unit));
          if (coil) {
            unit = coil.unit;
            flags.push(`Counted in ${coil.unit} (name says COIL)`);
          } else {
            flags.push('Name says COIL — check the unit; this item has no coil unit');
          }
        }
        if (sheetQty === 1 && isFeetItem(item) && !unit) {
          include = false;
          flags.push('Qty is exactly 1 — often a Manager.io placeholder');
        }
        if (sheetQty !== round3(sheetQty)) flags.push('More than 3 decimals — will be rounded');
      }
      return { row: idx + 1, managerName, sheetQty, itemId, amount: rawQty, unit, include, flags };
    });

    // Several sheet rows pointing at one item are added together (one opening per item).
    const byItem = new Map<string, number[]>();
    for (const r of parsed) if (r.itemId) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r.row]);
    for (const r of parsed) {
      const others = r.itemId ? (byItem.get(r.itemId) ?? []).filter((n) => n !== r.row) : [];
      if (others.length) r.flags.push(`Same item as row ${others.join(', ')} — added together`);
    }

    setRows(parsed);
    setSourceName(name);
    setView('import');
  };

  const readFile = async (file: File) => {
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file');
        const sheet = await readXlsxFile(file);
        await load(sheet.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v)))), file.name);
      } else {
        await load(parseDelimited(await file.text()), file.name);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  const update = (row: number, patch: Partial<SheetRow>) =>
    setRows((rs) => rs?.map((r) => (r.row === row ? { ...r, ...patch } : r)) ?? null);

  // ---- per-row status
  const effectiveUnit = (r: SheetRow, item: Item | undefined): string =>
    r.unit ?? (isFeetItem(item) ? sheetUnit : (item?.base_unit ?? ''));

  /** Why a row can't be imported at all (null = it can). */
  const blocked = (r: SheetRow): string | null => {
    if (!r.managerName) return 'No item name';
    if (!r.itemId) return 'Not in Inventory — import the item first';
    const item = itemMap.get(r.itemId);
    if (!item) return 'Not in Inventory — import the item first';
    if (!item.active) return 'Item is inactive';
    if (r.sheetQty === null || !Number.isFinite(r.sheetQty)) return 'No quantity';
    if (r.sheetQty === 0) return 'Zero in Manager.io';
    if (r.sheetQty < 0) return 'Negative in Manager.io';
    if (locationId && existing.has(r.itemId)) return 'Opening stock already recorded here';
    return null;
  };

  /** Quantity in the item's base unit, or null while it can't be worked out. */
  const baseQty = (r: SheetRow): number | null => {
    const item = r.itemId ? itemMap.get(r.itemId) : undefined;
    const unit = effectiveUnit(r, item);
    if (!item || !unit || r.amount.trim() === '') return null;
    const value = Number(r.amount);
    const factor = rowUnits(item).find((u) => u.unit === unit)?.factor;
    if (!Number.isFinite(value) || factor === undefined) return null;
    return round3(value * factor);
  };

  const live = rows ?? [];
  const importable = live.filter((r) => !blocked(r));
  const chosen = importable.filter((r) => r.include);
  const badAmount = chosen.filter((r) => {
    const q = baseQty(r);
    return q !== null && q <= 0;
  });
  const needsSheetUnit = chosen.some((r) => r.unit === null && isFeetItem(itemMap.get(r.itemId!)));
  const ready = chosen.length > 0 && !!locationId && !!date && !(needsSheetUnit && !sheetUnit) && badAmount.length === 0;

  // One opening per item: rows for the same item are added together.
  const totals = new Map<string, number>();
  for (const r of chosen) {
    const q = baseQty(r);
    if (q !== null && q > 0) totals.set(r.itemId!, round3((totals.get(r.itemId!) ?? 0) + q));
  }

  const shown = live.filter((r) =>
    view === 'all' ? true : view === 'skipped' ? !!blocked(r) || !r.include : !blocked(r) && r.include,
  );
  const unchecked = importable.filter((r) => !r.include);

  const post = async () => {
    const where = locationName(session, locationId);
    if (!window.confirm(`Record opening stock for ${totals.size} items at ${where}, dated ${date}?`)) return;
    const batchId = crypto.randomUUID();
    const failed: { name: string; message: string }[] = [];
    let ok = 0;
    await action.run(async () => {
      for (const [itemId, quantity] of totals) {
        try {
          await recordOpening({
            itemId,
            locationId,
            quantity,
            unitCost: null,
            date,
            note: `Imported from ${sourceName || 'Manager.io sheet'}`,
            bundles: null,
            batchId,
          });
          ok++;
        } catch (e) {
          failed.push({ name: itemMap.get(itemId)?.name ?? itemId, message: e instanceof Error ? e.message : String(e) });
        }
      }
      setFailures(failed);
      setExisting(await itemsWithOpening(locationId).catch(() => existing));
      return `Opening stock recorded for ${ok} item${ok === 1 ? '' : 's'} at ${where}.${failed.length ? ` ${failed.length} failed — see below.` : ''}`;
    });
  };

  if (allowed.length === 0) {
    return (
      <div className="card">
        <h1 className="page-title">Import opening stock</h1>
        <Banner kind="info">No locations are assigned to you. Ask the owner to assign them.</Banner>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">Import opening stock</h1>
      <p className="page-sub">
        Upload the Manager.io Inventory Items sheet (Item name + Qty owned) for one location. Items must already exist —
        bring them in first with <a href={href('import')}>Import</a>. Each cable item gets one bundle with the full
        length. <a href={href('opening')}>Enter one item by hand instead</a>
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      {failures.length > 0 && (
        <Banner kind="error">
          {failures.map((f) => (
            <div key={f.name}>
              <strong>{f.name}:</strong> {f.message}
            </div>
          ))}
        </Banner>
      )}

      {!rows && (
        <div className="card import-input">
          <div className="field">
            <label htmlFor="oi-paste">Paste from Excel (with the header row)</label>
            <textarea
              id="oi-paste"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Item name\tSales price\tQty owned\n1.5MM 2 CORE FLEXIBLE\t\t2959.4'}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => void load(parseDelimited(text), 'Pasted from Excel')}>
              Read pasted rows
            </button>
            <span className="sub">or</span>
            <label className="btn btn-secondary">
              Upload .xlsx / .csv
              <input
                type="file"
                accept=".xlsx,.csv,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <Banner kind="error">{parseError}</Banner>
        </div>
      )}

      {rows && (
        <div className="card">
          <div className="page-head">
            <div>
              <div className="section-title">
                Review {rows.length} rows from {sourceName}
              </div>
              <p className="sub">
                {chosen.length} rows to import ({totals.size} items) · {unchecked.length} unticked · {live.length - importable.length} can't be
                imported
              </p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setRows(null)}>
                Start again
              </button>
              <button type="button" className="btn btn-primary" disabled={!ready || action.busy} onClick={() => void post()}>
                {action.busy ? 'Recording…' : `Record ${totals.size} openings`}
              </button>
            </div>
          </div>

          <div className="form-grid oi-settings">
            <div className="field">
              <label htmlFor="oi-location">Location</label>
              <LocationSelect id="oi-location" locations={session.locations} allowedIds={allowed} value={locationId} onChange={setLocationId} />
            </div>
            <div className="field">
              <label htmlFor="oi-date">Cut-over date</label>
              <input id="oi-date" type="date" value={date} max={todayKarachi()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="oi-unit">Cable quantities in the sheet are in</label>
              <select
                id="oi-unit"
                className={needsSheetUnit && !sheetUnit ? 'missing' : undefined}
                value={sheetUnit}
                onChange={(e) => setSheetUnit(e.target.value as SheetUnit)}
              >
                <option value="">Choose…</option>
                <option value="ft">Feet</option>
                <option value="m">Metres</option>
                <option value="yd">Yards</option>
              </select>
            </div>
          </div>
          {!locationId && <Banner kind="info">Choose the location this stock is at.</Banner>}
          {needsSheetUnit && !sheetUnit && <Banner kind="info">Choose the unit Manager.io counts cable in — it's converted to feet.</Banner>}

          <div className="filters">
            <select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="Rows to show">
              <option value="import">To import ({chosen.length})</option>
              <option value="skipped">Not importing ({live.length - chosen.length})</option>
              <option value="all">All rows ({live.length})</option>
            </select>
            {unchecked.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setRows((rs) => rs?.map((r) => (blocked(r) ? r : { ...r, include: true })) ?? null)}
              >
                Tick all {unchecked.length} unticked rows
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <Empty>No rows here.</Empty>
          ) : (
            <div className="table-scroll">
              <table className="import-grid">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Import</th>
                    <th>Manager.io name</th>
                    <th>Inventory item</th>
                    <th className="num">Qty</th>
                    <th>Unit</th>
                    <th className="num">Opening stock</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const item = r.itemId ? itemMap.get(r.itemId) : undefined;
                    const why = blocked(r);
                    const units = rowUnits(item);
                    const q = why ? null : baseQty(r);
                    return (
                      <tr key={r.row} className={why || !r.include ? 'muted-row' : r.flags.length ? 'attention-row' : undefined}>
                        <td className="mono">{r.row}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={!why && r.include}
                            disabled={!!why}
                            aria-label={`Import row ${r.row}`}
                            onChange={(e) => update(r.row, { include: e.target.checked })}
                          />
                        </td>
                        <td className="wrap import-name">{r.managerName || <span className="sub">(blank)</span>}</td>
                        <td className="wrap">{item ? item.name : '—'}</td>
                        <td className="num">
                          {why ? (
                            <span className="mono">{r.sheetQty ?? '—'}</span>
                          ) : (
                            <input
                              className="cell-input narrow"
                              type="number"
                              step="any"
                              aria-label={`Quantity for row ${r.row}`}
                              value={r.amount}
                              onChange={(e) => update(r.row, { amount: e.target.value })}
                            />
                          )}
                        </td>
                        <td>
                          {!why && item && (
                            <select value={r.unit ?? ''} aria-label={`Unit for row ${r.row}`} onChange={(e) => update(r.row, { unit: e.target.value || null })}>
                              <option value="">{isFeetItem(item) ? `Sheet (${sheetUnit || '?'})` : item.base_unit}</option>
                              {units
                                .filter((u) => isFeetItem(item) || u.unit !== item.base_unit)
                                .map((u) => (
                                  <option key={u.unit} value={u.unit}>
                                    {u.unit}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        <td className="mono num">{q === null ? '—' : q <= 0 ? <span className="neg">must be above 0</span> : formatQty(q, item?.base_unit)}</td>
                        <td className="wrap import-flags">
                          {why && <span className="tag muted">{why}</span>}
                          {!why &&
                            r.flags.map((f) => (
                              <span key={f} className="tag low">
                                {f}
                              </span>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="table-note">
            Recorded once per item and location. To correct one afterwards, reverse it on the Movements page and enter it again.
          </p>
        </div>
      )}
    </>
  );
}

export default OpeningImportPage;
