import { useMemo, useState } from 'react';
import { importItems, linkedManagerKeys, listImportBatches, undoItemImport, type ImportPayloadRow } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { formatDateTime } from '../format';
import { useAction, useAsync } from '../hooks';
import {
  FLAG,
  parseDelimited,
  parseTable,
  specKey,
  type ImportCategory,
  type ImportRow,
  type RowAction,
} from '../import/managerParser';
import { href } from '../router';
import type { Session } from '../session';
import './ImportPage.css';

const CABLE_TYPES = ['Round', 'Flat', 'Shielded', 'Control', 'Armoured', 'Welding'];
const OTHER_UNITS = ['pcs', 'roll', 'ft', 'm'];

/** What a row still needs before it can be imported (empty = ready). */
function needs(r: ImportRow): string[] {
  if (r.action === 'skip' || r.action === 'merge') return [];
  if (r.category === 'finished_cable') {
    const n: string[] = [];
    if (!r.specs.size_mm2.trim()) n.push('size');
    if (!r.specs.cores.trim()) n.push('cores');
    if (!r.specs.flex_standard) n.push('Flexible/Standard');
    return n;
  }
  return r.name.trim() ? [] : ['name'];
}

function invoicePreview(r: ImportRow): string {
  if (r.category !== 'finished_cable') return r.name;
  const s = r.specs;
  return [
    s.material === 'Silver' ? 'Silver' : '',
    s.size_mm2 && `${s.size_mm2} mm²`,
    s.cores && `${s.cores} Core`,
    s.flex_standard,
    s.cable_type === 'Round' ? '' : s.cable_type,
    s.double_pvc ? 'Double PVC' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Manager.io item import: paste (or upload) the Batch Update export, review
 * every row, then create all items in one batch. A batch can be undone until
 * any of its items has stock movements. Stock quantities are NOT imported.
 */
function ImportPage({ session }: { session: Session }) {
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'attention' | 'skipped'>('attention');
  const [bulkFlex, setBulkFlex] = useState('Standard');
  const action = useAction();
  const batches = useAsync(listImportBatches, []);

  // Rows that already exist in Inventory (same Manager.io key, or same specs as an active item).
  const existingKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of session.items) {
      if (!i.active) continue;
      if (i.category === 'finished_cable') {
        const s = i.specs;
        map.set(
          [s.material ?? 'Copper', s.size_mm2 ?? '', s.cores ?? '', s.flex_standard ?? '', s.cable_type ?? 'Round', s.double_pvc ? 'dpvc' : '', s.wires ?? '', s.thou ?? '']
            .map((v) => String(v).trim().toLowerCase())
            .join('|'),
          i.name,
        );
      } else map.set(`${i.category}|${i.name.trim().toLowerCase()}`, i.name);
    }
    return map;
  }, [session.items]);

  const load = async (table: string[][], name: string) => {
    const { rows: parsed, error } = parseTable(table);
    setParseError(error);
    if (error) return;
    const linked = await linkedManagerKeys().catch(() => new Set<string>());
    setRows(
      parsed.map((r) => {
        const exists = linked.has(r.managerKey) ? 'this Manager.io key' : existingKeys.get(specKey(r));
        return exists && r.action !== 'skip'
          ? { ...r, action: 'skip' as RowAction, mergeInto: null, flags: [...r.flags, `${FLAG.exists} (${exists})`] }
          : r;
      }),
    );
    setSourceName(name);
    action.clear();
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

  const update = (row: number, patch: Partial<ImportRow> | ((r: ImportRow) => ImportRow)) =>
    setRows((rs) => rs?.map((r) => (r.row === row ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r)) ?? null);
  const updateSpec = (row: number, key: keyof ImportRow['specs'], value: string | boolean) =>
    update(row, (r) => ({ ...r, specs: { ...r.specs, [key]: value } }));

  // Live checks on the current rows.
  const live = rows ?? [];
  const keepRows = live.filter((r) => r.action === 'keep');
  const keyCount = new Map<string, number[]>();
  for (const r of keepRows) keyCount.set(specKey(r), [...(keyCount.get(specKey(r)) ?? []), r.row]);
  const dupOf = (r: ImportRow) => (r.action === 'keep' ? (keyCount.get(specKey(r)) ?? []).filter((n) => n !== r.row) : []);
  const keepNumbers = new Set(keepRows.map((r) => r.row));
  const badMerge = (r: ImportRow) => r.action === 'merge' && (r.mergeInto === null || !keepNumbers.has(r.mergeInto));
  const problems = live.filter((r) => needs(r).length > 0 || dupOf(r).length > 0 || badMerge(r));
  const attention = (r: ImportRow) =>
    needs(r).length > 0 || dupOf(r).length > 0 || badMerge(r) || r.flags.length > 0 || r.action !== 'keep';
  const shown = live.filter((r) => (view === 'all' ? true : view === 'skipped' ? r.action === 'skip' : attention(r)));
  const missingFlex = live.filter((r) => r.action === 'keep' && r.category === 'finished_cable' && !r.specs.flex_standard);

  const post = async () => {
    if (!rows) return;
    const merges = new Map<number, { manager_key: string; manager_name: string }[]>();
    for (const r of rows.filter((x) => x.action === 'merge' && x.mergeInto !== null)) {
      merges.set(r.mergeInto!, [...(merges.get(r.mergeInto!) ?? []), { manager_key: r.managerKey, manager_name: r.managerName }]);
    }
    const payload: ImportPayloadRow[] = keepRows.map((r) => ({
      manager_key: r.managerKey,
      manager_name: r.managerName,
      category: r.category,
      ...(r.category === 'finished_cable'
        ? {
            source: r.source,
            specs: {
              material: r.specs.material,
              size_mm2: r.specs.size_mm2.trim(),
              cores: r.specs.cores.trim(),
              flex_standard: r.specs.flex_standard,
              cable_type: r.specs.cable_type,
              double_pvc: r.specs.double_pvc,
              ...(r.specs.wires.trim() ? { wires: r.specs.wires.trim() } : {}),
              ...(r.specs.thou.trim() ? { thou: r.specs.thou.trim() } : {}),
            },
          }
        : { name: r.name.trim(), base_unit: r.baseUnit, description: r.description.trim() || undefined }),
      merge_keys: merges.get(r.row) ?? [],
    }));
    const ok = await action.run(async () => {
      await importItems(payload, sourceName || null);
      await session.reloadCatalog();
      const merged = [...merges.values()].flat().length;
      return `Imported ${payload.length} items${merged ? ` (${merged} row${merged === 1 ? '' : 's'} merged in)` : ''}. No stock was imported.`;
    });
    if (ok) {
      setRows(null);
      setText('');
      batches.reload();
    }
  };

  const undo = (batchId: string, count: number) =>
    void action
      .run(async () => {
        if (!window.confirm(`Remove the ${count} items created by this import?`)) return;
        const n = await undoItemImport(batchId);
        await session.reloadCatalog();
        return `Import undone: ${n} items removed.`;
      })
      .then(() => batches.reload());

  return (
    <>
      <h1 className="page-title">Import items from Manager.io</h1>
      <p className="page-sub">
        In Manager.io open Inventory Items → Batch Update → Copy to clipboard, paste into Excel, then paste here (or upload
        the .xlsx / .csv). Only the item list is imported, never stock quantities.
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>

      {!rows && (
        <div className="card import-input">
          <div className="field">
            <label htmlFor="imp-paste">Paste from Excel (with the header row)</label>
            <textarea id="imp-paste" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Item name\tSales price\tQty owned\n1.5MM 2 CORE FLEXIBLE\t\t2959.4'} />
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
              <div className="section-title">Review {rows.length} rows from {sourceName}</div>
              <p className="sub">
                {keepRows.length} to create · {rows.filter((r) => r.action === 'merge').length} merged · {rows.filter((r) => r.action === 'skip').length} skipped ·{' '}
                {problems.length ? <strong className="neg">{problems.length} need attention</strong> : 'all rows ready'}
              </p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setRows(null)}>
                Start again
              </button>
              <button type="button" className="btn btn-primary" disabled={problems.length > 0 || keepRows.length === 0 || action.busy} onClick={() => void post()}>
                {action.busy ? 'Importing…' : `Import ${keepRows.length} items`}
              </button>
            </div>
          </div>

          <div className="filters">
            <select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="Rows to show">
              <option value="attention">Rows to check ({live.filter(attention).length})</option>
              <option value="all">All rows ({live.length})</option>
              <option value="skipped">Skipped ({live.filter((r) => r.action === 'skip').length})</option>
            </select>
            {missingFlex.length > 0 && (
              <div className="inline-input bulk">
                <span className="sub">{missingFlex.length} rows have no Flexible/Standard. Set them to</span>
                <select value={bulkFlex} onChange={(e) => setBulkFlex(e.target.value)} aria-label="Flexible or Standard">
                  <option>Standard</option>
                  <option>Flexible</option>
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() =>
                    setRows((rs) =>
                      rs?.map((r) =>
                        r.action === 'keep' && r.category === 'finished_cable' && !r.specs.flex_standard
                          ? { ...r, specs: { ...r.specs, flex_standard: bulkFlex } }
                          : r,
                      ) ?? null,
                    )
                  }
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <Empty>Nothing to check. Switch to "All rows" to see everything.</Empty>
          ) : (
            <div className="table-scroll">
              <table className="import-grid">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Manager.io name</th>
                    <th>Check</th>
                    <th>Action</th>
                    <th>Category</th>
                    <th>Material</th>
                    <th>Size mm²</th>
                    <th>Cores</th>
                    <th>Flex / Std</th>
                    <th>Type</th>
                    <th>2×PVC</th>
                    <th>Wires</th>
                    <th>Thou</th>
                    <th>Source / unit</th>
                    <th>Invoice name</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const cable = r.category === 'finished_cable';
                    const off = r.action !== 'keep';
                    const n = needs(r);
                    const d = dupOf(r);
                    return (
                      <tr key={r.row} className={off ? 'muted-row' : n.length || d.length || badMerge(r) ? 'attention-row' : undefined}>
                        <td className="mono">{r.row}</td>
                        <td className="wrap import-name">{r.managerName || <span className="sub">(blank)</span>}</td>
                        <td className="wrap import-flags">
                          {n.length > 0 && <span className="tag low">Needs {n.join(', ')}</span>}
                          {d.length > 0 && <span className="tag low">Same specs as row {d.join(', ')}</span>}
                          {badMerge(r) && <span className="tag low">Choose a kept row to merge into</span>}
                          {r.flags
                            .filter((f) => f !== FLAG.unclear && f !== FLAG.missingFlex)
                            .map((f) => (
                              <span key={f} className="tag muted">
                                {f}
                              </span>
                            ))}
                        </td>
                        <td>
                          <div className="inline-input">
                            <select
                              value={r.action}
                              aria-label={`Action for row ${r.row}`}
                              onChange={(e) => update(r.row, { action: e.target.value as RowAction, mergeInto: e.target.value === 'merge' ? r.mergeInto : null })}
                            >
                              <option value="keep">Keep</option>
                              <option value="merge">Merge into</option>
                              <option value="skip">Skip</option>
                            </select>
                            {r.action === 'merge' && (
                              <input
                                className="cell-input narrow"
                                type="number"
                                aria-label={`Merge row ${r.row} into row`}
                                value={r.mergeInto ?? ''}
                                onChange={(e) => update(r.row, { mergeInto: e.target.value ? Number(e.target.value) : null })}
                              />
                            )}
                          </div>
                        </td>
                        <td>
                          <select
                            value={r.category}
                            disabled={off}
                            aria-label={`Category for row ${r.row}`}
                            onChange={(e) => {
                              const category = e.target.value as ImportCategory;
                              update(r.row, {
                                category,
                                baseUnit: category === 'finished_cable' ? 'ft' : r.baseUnit === 'ft' ? 'pcs' : r.baseUnit,
                                name: category === 'finished_cable' ? '' : r.name || r.managerName,
                              });
                            }}
                          >
                            <option value="finished_cable">Cable</option>
                            <option value="other">Other</option>
                          </select>
                        </td>
                        {cable ? (
                          <>
                            <td>
                              <select value={r.specs.material} disabled={off} aria-label="Material" onChange={(e) => updateSpec(r.row, 'material', e.target.value)}>
                                <option>Copper</option>
                                <option>Silver</option>
                              </select>
                            </td>
                            <td>
                              <input className={`cell-input tiny${n.includes('size') ? ' missing' : ''}`} value={r.specs.size_mm2} disabled={off} aria-label="Size" onChange={(e) => updateSpec(r.row, 'size_mm2', e.target.value)} />
                            </td>
                            <td>
                              <input className={`cell-input tiny${n.includes('cores') ? ' missing' : ''}`} value={r.specs.cores} disabled={off} aria-label="Cores" onChange={(e) => updateSpec(r.row, 'cores', e.target.value)} />
                            </td>
                            <td>
                              <select
                                className={n.includes('Flexible/Standard') ? 'missing' : undefined}
                                value={r.specs.flex_standard}
                                disabled={off}
                                aria-label="Flexible or Standard"
                                onChange={(e) => updateSpec(r.row, 'flex_standard', e.target.value)}
                              >
                                <option value="">?</option>
                                <option>Flexible</option>
                                <option>Standard</option>
                              </select>
                            </td>
                            <td>
                              <select value={r.specs.cable_type} disabled={off} aria-label="Cable type" onChange={(e) => updateSpec(r.row, 'cable_type', e.target.value)}>
                                {CABLE_TYPES.map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input type="checkbox" checked={r.specs.double_pvc} disabled={off} aria-label="Double PVC" onChange={(e) => updateSpec(r.row, 'double_pvc', e.target.checked)} />
                            </td>
                            <td>
                              <input className="cell-input tiny" value={r.specs.wires} disabled={off} aria-label="Wires" onChange={(e) => updateSpec(r.row, 'wires', e.target.value)} />
                            </td>
                            <td>
                              <input className="cell-input tiny" value={r.specs.thou} disabled={off} aria-label="Thou" onChange={(e) => updateSpec(r.row, 'thou', e.target.value)} />
                            </td>
                            <td>
                              <select value={r.source} disabled={off} aria-label="Source" onChange={(e) => update(r.row, { source: e.target.value as ImportRow['source'] })}>
                                <option value="made">Made</option>
                                <option value="bought">Bought</option>
                                <option value="both">Both</option>
                              </select>
                            </td>
                          </>
                        ) : (
                          <>
                            <td colSpan={8}>
                              <input
                                className={`cell-input wide${n.includes('name') ? ' missing' : ''}`}
                                value={r.name}
                                disabled={off}
                                aria-label="Item name"
                                onChange={(e) => update(r.row, { name: e.target.value })}
                              />
                            </td>
                            <td>
                              <select value={r.baseUnit} disabled={off} aria-label="Unit" onChange={(e) => update(r.row, { baseUnit: e.target.value })}>
                                {OTHER_UNITS.map((u) => (
                                  <option key={u}>{u}</option>
                                ))}
                              </select>
                            </td>
                          </>
                        )}
                        <td className="wrap">{off ? '—' : invoicePreview(r)}</td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card import-batches">
        <div className="section-title">Previous imports</div>
        {batches.error && <Banner kind="error">{batches.error}</Banner>}
        {batches.loading && !batches.data ? (
          <Loading />
        ) : (batches.data ?? []).length === 0 ? (
          <Empty>No imports yet.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th className="num">Items</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(batches.data ?? []).map((b) => (
                  <tr key={b.id}>
                    <td className="sub">{formatDateTime(b.created_at)}</td>
                    <td>{b.source_name ?? '—'}</td>
                    <td className="mono num">{b.item_count}</td>
                    <td>{b.undone_at ? <span className="tag muted">Undone</span> : <span className="tag ok">Imported</span>}</td>
                    <td className="num">
                      {!b.undone_at && (
                        <button type="button" className="link-btn" onClick={() => undo(b.id, b.item_count)}>
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="table-note">
          An import can be undone until any of its items has stock movements. <a href={href('items')}>See all items</a>
        </p>
      </div>
    </>
  );
}

export default ImportPage;
