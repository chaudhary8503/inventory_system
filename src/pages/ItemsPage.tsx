import { useMemo, useState, type FormEvent } from 'react';
import {
  getItemSpecs,
  itemCosts,
  itemUnits,
  listSpecOptions,
  saveItem,
  saveItemUnit,
  setItemActive,
  setStandardCost,
  type Category,
  type Item,
  type SpecOption,
  type SpecType,
} from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { CATEGORY_LABELS, formatQty, formatUnitCost } from '../format';
import { useAction, useAsync } from '../hooks';
import { go, href } from '../router';
import { itemById, type Session } from '../session';

/** Item master: list, plus the editor for one item (#/items/new or #/items/<id>). */
function ItemsPage({ session, editId }: { session: Session; editId: string | undefined }) {
  if (editId) return <ItemEditor key={editId} session={session} itemId={editId === 'new' ? null : editId} />;
  return <ItemList session={session} />;
}

function ItemList({ session }: { session: Session }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return session.items
      .filter((i) => showInactive || i.active)
      .filter((i) => !category || i.category === category)
      .filter((i) => words.every((w) => `${i.name} ${i.code ?? ''}`.toLowerCase().includes(w)));
  }, [session.items, search, category, showInactive]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Items</h1>
          <p className="page-sub">Everything stocked: copper, PVC, finished cable and consumables.</p>
        </div>
        {session.can('manage_items') && (
          <a className="btn btn-primary" href={href('items/new')}>
            New item
          </a>
        )}
      </div>
      <div className="card">
        <div className="filters">
          <input className="grow" type="search" placeholder="Search items" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
        {rows.length === 0 ? (
          <Empty>No items yet.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Other units</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.item_id} className="clickable" onClick={() => go(`items/${i.item_id}`)}>
                    <td className="wrap">{i.name}</td>
                    <td className="mono">{i.code ?? '—'}</td>
                    <td>{CATEGORY_LABELS[i.category]}</td>
                    <td>{i.base_unit}</td>
                    <td className="sub">
                      {i.units
                        .filter((u) => u.unit !== i.base_unit)
                        .map((u) => `${u.unit} = ${formatQty(u.factor_to_base, i.base_unit)}`)
                        .join(', ') || '—'}
                    </td>
                    <td>{i.active ? <span className="tag ok">Active</span> : <span className="tag muted">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="table-note">{rows.length} items</p>
      </div>
    </>
  );
}

const SPEC_FIELDS: Record<Category, { key: string; label: string; type: SpecType }[]> = {
  finished_cable: [
    { key: 'mm2_option_id', label: 'Size (mm²)', type: 'mm2' },
    { key: 'cores_option_id', label: 'Cores', type: 'cores' },
    { key: 'wires_option_id', label: 'Wires (strands)', type: 'wires' },
    { key: 'thou_option_id', label: 'Thou', type: 'thou' },
    { key: 'type_option_id', label: 'Type', type: 'cable_type' },
  ],
  pvc: [
    { key: 'colour_option_id', label: 'Colour', type: 'pvc_colour' },
    { key: 'grade_option_id', label: 'Grade', type: 'pvc_grade' },
  ],
  copper: [{ key: 'thou_option_id', label: 'Thou', type: 'thou' }],
  consumable: [],
};

function ItemEditor({ session, itemId }: { session: Session; itemId: string | null }) {
  const existing = itemById(session, itemId);
  const canEdit = session.can('manage_items');
  const options = useAsync(listSpecOptions, []);
  const loaded = useAsync(async () => {
    if (!itemId) return null;
    const [specs, units, costs] = await Promise.all([
      getItemSpecs(itemId),
      itemUnits(itemId),
      session.can('view_costs') ? itemCosts([itemId]) : Promise.resolve([]),
    ]);
    const values: Record<string, string> = {};
    for (const obj of [specs.cable, specs.pvc, specs.copper]) {
      for (const [k, v] of Object.entries(obj ?? {})) if (k !== 'item_id' && v) values[k] = String(v);
    }
    return { specs: values, units, cost: costs[0] ?? null };
  }, [itemId]);

  if (itemId && !existing) {
    return (
      <div className="card">
        <h1 className="page-title">Item not found</h1>
        <a href={href('items')}>Back to items</a>
      </div>
    );
  }

  const ready = (!options.loading || options.data) && (!itemId || loaded.data);

  return (
    <>
      <p className="sub">
        <a href={href('items')}>Items</a> / {existing ? existing.name : 'New item'}
      </p>
      <h1 className="page-title">{existing ? existing.name : 'New item'}</h1>
      <p className="page-sub">
        {existing ? (
          <a href={href(`item/${existing.item_id}`)}>View stock and history</a>
        ) : (
          'Cable, PVC and copper names are built from the specs if you leave the name blank.'
        )}
      </p>

      <div className="stack">
        {canEdit && (
          <div className="card">
            <Banner kind="error">{options.error || loaded.error}</Banner>
            {!ready ? (
              <Loading />
            ) : (
              <ItemForm
                session={session}
                existing={existing}
                options={options.data ?? []}
                initialSpecs={loaded.data?.specs ?? {}}
                onSaved={loaded.reload}
              />
            )}
          </div>
        )}

        {existing && canEdit && (
          <UnitsCard
            item={existing}
            units={loaded.data?.units ?? []}
            onSaved={async () => {
              await session.reloadCatalog();
              loaded.reload();
            }}
          />
        )}

        {existing && existing.category === 'finished_cable' && session.can('edit_standard_cost') && (
          <StandardCostCard itemId={existing.item_id} current={loaded.data?.cost?.standard_cost ?? null} canSee={session.can('view_costs')} onSaved={loaded.reload} />
        )}

        {existing && canEdit && <ActiveCard item={existing} onSaved={session.reloadCatalog} />}
      </div>
    </>
  );
}

function ItemForm({
  session,
  existing,
  options,
  initialSpecs,
  onSaved,
}: {
  session: Session;
  existing: Item | undefined;
  options: SpecOption[];
  initialSpecs: Record<string, string>;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<Category>(existing?.category ?? 'finished_cable');
  const [baseUnit, setBaseUnit] = useState<Item['base_unit']>(existing?.base_unit ?? 'pcs');
  const [name, setName] = useState(existing?.name ?? '');
  const [rebuildName, setRebuildName] = useState(false);
  const [code, setCode] = useState(existing?.code ?? '');
  const [specs, setSpecs] = useState<Record<string, string>>(initialSpecs);
  const action = useAction();

  const optionsOf = (type: SpecType): SpecOption[] =>
    options.filter((o) => o.spec_type === type && (o.active || Object.values(specs).includes(o.id)));
  const fields = SPEC_FIELDS[category];
  const nameOptional = category !== 'consumable';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      const item: Record<string, unknown> = { category, code: code.trim() || null };
      if (existing) item.id = existing.item_id;
      if (category === 'consumable') item.base_unit = baseUnit;
      if (rebuildName) item.name = '';
      else if (name.trim()) item.name = name.trim();
      const specPayload: Record<string, unknown> = {};
      for (const f of fields) specPayload[f.key] = specs[f.key] || null;
      if (category === 'copper') specPayload.form = specs.form || null;
      const id = await saveItem(item, fields.length || category === 'copper' ? specPayload : null);
      await session.reloadCatalog();
      if (!existing) {
        go(`items/${id}`);
        return;
      }
      if (rebuildName) {
        setRebuildName(false);
        setName('');
      }
      return 'Item saved.';
    });
    if (ok && existing) onSaved();
  };

  return (
    <>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="it-category">Category</label>
            <select id="it-category" value={category} onChange={(e) => setCategory(e.target.value as Category)} disabled={!!existing}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {existing && <div className="hint">Category and unit are fixed once an item exists.</div>}
          </div>
          <div className="field">
            <label htmlFor="it-unit">Stock unit</label>
            {category === 'consumable' ? (
              <select id="it-unit" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value as Item['base_unit'])} disabled={!!existing}>
                <option value="pcs">pcs (pieces)</option>
                <option value="kg">kg</option>
                <option value="m">m (metres, e.g. rope)</option>
              </select>
            ) : (
              <input id="it-unit" value={category === 'finished_cable' ? 'ft (feet)' : 'kg'} disabled />
            )}
          </div>

          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`it-${f.key}`}>{f.label}</label>
              <select id={`it-${f.key}`} value={specs[f.key] ?? ''} onChange={(e) => setSpecs({ ...specs, [f.key]: e.target.value })}>
                <option value="">—</option>
                {optionsOf(f.type).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.value}
                    {!o.active ? ' (hidden)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {category === 'copper' && (
            <div className="field">
              <label htmlFor="it-form">Form</label>
              <select id="it-form" value={specs.form ?? ''} onChange={(e) => setSpecs({ ...specs, form: e.target.value })}>
                <option value="">—</option>
                <option value="rod">Rod</option>
                <option value="wire">Drawn wire</option>
              </select>
            </div>
          )}
          {fields.length > 0 && (
            <div className="field span-2">
              <div className="hint">
                Missing a value? Add it under <a href={href('specs')}>Spec lists</a>.
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="it-name">Name{nameOptional ? ' (blank = build from specs)' : ''}</label>
            <input
              id="it-name"
              value={rebuildName ? '' : name}
              disabled={rebuildName}
              onChange={(e) => setName(e.target.value)}
              placeholder={nameOptional ? 'Leave blank to build it' : 'e.g. Packing tape 2 inch'}
            />
            {existing && nameOptional && (
              <label className="checkbox rebuild">
                <input type="checkbox" checked={rebuildName} onChange={(e) => setRebuildName(e.target.checked)} />
                Rebuild the name from the specs
              </label>
            )}
          </div>
          <div className="field">
            <label htmlFor="it-code">Code (optional)</label>
            <input id="it-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SKU" />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={action.busy}>
            {action.busy ? 'Saving…' : existing ? 'Save changes' : 'Create item'}
          </button>
          <a className="btn btn-secondary" href={href('items')}>
            Back
          </a>
        </div>
      </form>
    </>
  );
}

function UnitsCard({
  item,
  units,
  onSaved,
}: {
  item: Item;
  units: { id: string; unit_name: string; factor_to_base: number; active: boolean }[];
  onSaved: () => Promise<void>;
}) {
  const [unitName, setUnitName] = useState('');
  const [factor, setFactor] = useState('');
  const action = useAction();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      const f = Number(factor);
      if (!unitName.trim() || !Number.isFinite(f) || f <= 0) throw new Error('Give a unit name and a number greater than 0.');
      await saveItemUnit(item.item_id, unitName.trim(), f, true);
      await onSaved();
      return `Saved: 1 ${unitName.trim()} = ${f} ${item.base_unit}.`;
    });
    if (ok) {
      setUnitName('');
      setFactor('');
    }
  };

  const toggle = (u: { unit_name: string; factor_to_base: number; active: boolean }) =>
    void action.run(async () => {
      await saveItemUnit(item.item_id, u.unit_name, u.factor_to_base, !u.active);
      await onSaved();
      return `${u.unit_name} ${u.active ? 'switched off' : 'switched on'}.`;
    });

  return (
    <div className="card">
      <div className="section-title">Other units for entry</div>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        Stock is always kept in {item.base_unit}. Other units only make entry easier, e.g. coil = 300 ft, bag = 25 kg.
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      {units.length > 0 && (
        <div className="table-scroll" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th className="num">Equals</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>{u.unit_name}</td>
                  <td className="mono num">{formatQty(u.factor_to_base, item.base_unit)}</td>
                  <td>{u.active ? <span className="tag ok">In use</span> : <span className="tag muted">Off</span>}</td>
                  <td className="num">
                    <button type="button" className="link-btn" onClick={() => toggle(u)}>
                      {u.active ? 'Switch off' : 'Switch on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} noValidate className="form-grid">
        <div className="field">
          <label htmlFor="un-name">Unit name</label>
          <input id="un-name" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. coil" />
        </div>
        <div className="field">
          <label htmlFor="un-factor">1 unit equals ({item.base_unit})</label>
          <div className="inline-input">
            <input id="un-factor" type="number" min={0} step="any" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="e.g. 300" />
            <button type="submit" className="btn btn-secondary" disabled={action.busy}>
              Save unit
            </button>
          </div>
          <div className="hint">Saving an existing unit name updates it.</div>
        </div>
      </form>
    </div>
  );
}

function StandardCostCard({ itemId, current, canSee, onSaved }: { itemId: string; current: number | null; canSee: boolean; onSaved: () => void }) {
  const [value, setValue] = useState('');
  const action = useAction();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      const cost = value.trim() === '' ? null : Number(value);
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Enter 0 or more, or leave blank to clear.');
      await setStandardCost(itemId, cost);
      return 'Standard cost saved.';
    });
    if (ok) {
      setValue('');
      onSaved();
    }
  };
  return (
    <div className="card">
      <div className="section-title">Standard cost</div>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        Values bobbins whose production order isn't finalized yet. Once Production sets the order cost, those bobbins use
        the real cost instead.
        {canSee ? ` Current: ${formatUnitCost(current, 'ft')}${current === null ? ' (not set)' : ''}.` : ''}
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      <form onSubmit={save} noValidate>
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="sc-value">Cost per ft (Rs)</label>
          <div className="inline-input">
            <input id="sc-value" type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            <button type="submit" className="btn btn-secondary" disabled={action.busy}>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ActiveCard({ item, onSaved }: { item: Item; onSaved: () => Promise<void> }) {
  const action = useAction();
  return (
    <div className="card">
      <div className="section-title">{item.active ? 'Deactivate' : 'Reactivate'}</div>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        {item.active
          ? 'Inactive items disappear from pickers. Items are never deleted; an item must have no stock left to be deactivated.'
          : 'This item is inactive and hidden from pickers.'}
      </p>
      <Banner kind="error">{action.error}</Banner>
      <button
        type="button"
        className={item.active ? 'btn btn-danger' : 'btn btn-secondary'}
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await setItemActive(item.item_id, !item.active);
            await onSaved();
          })
        }
      >
        {item.active ? 'Deactivate item' : 'Reactivate item'}
      </button>
    </div>
  );
}

export default ItemsPage;
