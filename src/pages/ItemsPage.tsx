import { useMemo, useState, type FormEvent } from 'react';
import {
  getItemDetails,
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
import { CATEGORY_LABELS, CATEGORY_ORDER, formatQty, formatUnitCost } from '../format';
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
      .filter((i) => words.every((w) => `${i.name} ${i.invoice_name ?? ''} ${i.code ?? ''}`.toLowerCase().includes(w)));
  }, [session.items, search, category, showInactive]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Items</h1>
          <p className="page-sub">Everything stocked: copper, PVC, part-finished, cable, consumables, scrap and other goods.</p>
        </div>
        {session.can('manage_items') && (
          <div className="form-actions">
            <a className="btn btn-secondary" href={href('import')}>
              Import from Manager.io
            </a>
            <a className="btn btn-primary" href={href('items/new')}>
              New item
            </a>
          </div>
        )}
      </div>
      <div className="card">
        <div className="filters">
          <input className="grow" type="search" placeholder="Search items" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORY_ORDER.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
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
                  <th>Name (staff)</th>
                  <th>Invoice name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.item_id} className="clickable" onClick={() => go(`items/${i.item_id}`)}>
                    <td className="wrap">{i.name}</td>
                    <td className="wrap">{i.invoice_name ?? '—'}</td>
                    <td>{CATEGORY_LABELS[i.category]}</td>
                    <td>{i.base_unit === 'ft' ? 'ft / m' : i.base_unit}</td>
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

// Spec fields per category: key in the database, label, option list.
const CABLE_FIELDS: { key: string; label: string; type: SpecType; required: boolean }[] = [
  { key: 'material_option_id', label: 'Material', type: 'material', required: true },
  { key: 'mm2_option_id', label: 'Size (mm²)', type: 'mm2', required: true },
  { key: 'cores_option_id', label: 'Cores', type: 'cores', required: true },
  { key: 'flex_option_id', label: 'Flexible / Standard', type: 'flex_standard', required: true },
  { key: 'cable_type_option_id', label: 'Cable type', type: 'cable_type', required: true },
  { key: 'wires_option_id', label: 'Wires (optional, not on invoices)', type: 'wires', required: false },
  { key: 'thou_option_id', label: 'Thou (optional, not on invoices)', type: 'thou', required: false },
];
const COPPER_FIELDS = [
  { key: 'grade_option_id', label: 'Copper grade', type: 'copper_grade' as SpecType, required: false },
  { key: 'thou_option_id', label: 'Thou (optional)', type: 'thou' as SpecType, required: false },
];
const PVC_FIELDS = [
  { key: 'colour_option_id', label: 'Colour', type: 'pvc_colour' as SpecType, required: false },
  { key: 'grade_option_id', label: 'Grade', type: 'pvc_grade' as SpecType, required: false },
];

const UNIT_CHOICES: Record<string, { value: string; label: string }[]> = {
  consumable: [
    { value: 'pcs', label: 'pcs (pieces)' },
    { value: 'kg', label: 'kg' },
    { value: 'm', label: 'm (metres, e.g. rope)' },
  ],
  other: [
    { value: 'pcs', label: 'pcs (pieces)' },
    { value: 'roll', label: 'roll' },
    { value: 'ft', label: 'ft (length)' },
    { value: 'm', label: 'm (metres)' },
  ],
};

function ItemEditor({ session, itemId }: { session: Session; itemId: string | null }) {
  const existing = itemById(session, itemId);
  const canEdit = session.can('manage_items');
  const options = useAsync(listSpecOptions, []);
  const loaded = useAsync(async () => {
    if (!itemId) return null;
    const [specs, units, costs, details] = await Promise.all([
      getItemSpecs(itemId),
      itemUnits(itemId),
      session.can('view_costs') ? itemCosts([itemId]) : Promise.resolve([]),
      getItemDetails(itemId),
    ]);
    const values: Record<string, string> = {};
    for (const obj of [specs.cable, specs.pvc, specs.copper]) {
      for (const [k, v] of Object.entries(obj ?? {})) if (k !== 'item_id' && v !== null && v !== undefined) values[k] = String(v);
    }
    return { specs: values, units, cost: costs[0] ?? null, details };
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
          <>
            Invoice name: <strong>{existing.invoice_name ?? existing.name}</strong> ·{' '}
            <a href={href(`item/${existing.item_id}`)}>View stock and history</a>
            {loaded.data?.details?.manager_name ? ` · Manager.io: ${loaded.data.details.manager_name}` : ''}
          </>
        ) : (
          'Cable, PVC and copper names are built from the specs. The invoice name never shows wires or thou.'
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
                details={loaded.data?.details ?? null}
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

        {existing && session.can('edit_standard_cost') && (
          <StandardCostCard item={existing} current={loaded.data?.cost?.standard_cost ?? null} canSee={session.can('view_costs')} onSaved={async () => {
            await session.reloadCatalog();
            loaded.reload();
          }} />
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
  details,
  onSaved,
}: {
  session: Session;
  existing: Item | undefined;
  options: SpecOption[];
  initialSpecs: Record<string, string>;
  details: { description: string | null; invoice_name_custom: boolean; name_custom: boolean } | null;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<Category>(existing?.category ?? 'finished_cable');
  const [baseUnit, setBaseUnit] = useState<string>(existing?.base_unit ?? 'pcs');
  const [name, setName] = useState(details?.name_custom || !existing ? (existing?.name ?? '') : '');
  const [autoName, setAutoName] = useState(existing ? !details?.name_custom : true);
  const [invoiceName, setInvoiceName] = useState(details?.invoice_name_custom ? (existing?.invoice_name ?? '') : '');
  const [customInvoice, setCustomInvoice] = useState(!!details?.invoice_name_custom);
  const [code, setCode] = useState(existing?.code ?? '');
  const [description, setDescription] = useState(details?.description ?? '');
  const [source, setSource] = useState<string>(existing?.source ?? 'made');
  const [specs, setSpecs] = useState<Record<string, string>>(() => {
    const s = { ...initialSpecs };
    if (!existing) {
      const def = (type: SpecType, value: string) => options.find((o) => o.spec_type === type && o.value.toLowerCase() === value)?.id;
      s.material_option_id = s.material_option_id ?? def('material', 'copper') ?? '';
      s.cable_type_option_id = s.cable_type_option_id ?? def('cable_type', 'round') ?? '';
    }
    return s;
  });
  const action = useAction();

  const fields = category === 'finished_cable' ? CABLE_FIELDS : category === 'copper' ? COPPER_FIELDS : category === 'pvc' ? PVC_FIELDS : [];
  const hasSpecs = fields.length > 0;
  const nameFromSpecs = hasSpecs && autoName;
  const optionsOf = (type: SpecType): SpecOption[] =>
    options.filter((o) => o.spec_type === type && (o.active || Object.values(specs).includes(o.id)));
  const optionValue = (key: string) => options.find((o) => o.id === specs[key])?.value ?? '';

  // Live preview of the built names (the database builds the real ones).
  const preview = (() => {
    if (category !== 'finished_cable') return null;
    const silver = optionValue('material_option_id').toLowerCase() === 'silver' ? 'Silver' : '';
    const type = optionValue('cable_type_option_id');
    const t = type.toLowerCase() === 'round' ? '' : type;
    const dpvc = specs.double_pvc === 'true' ? 'Double PVC' : '';
    const wt = [optionValue('wires_option_id'), optionValue('thou_option_id')].filter(Boolean).join('/');
    const size = optionValue('mm2_option_id');
    const cores = optionValue('cores_option_id');
    const flex = optionValue('flex_option_id');
    return {
      internal: [silver, size && `${size} mm²`, cores && `${cores}-core`, wt, flex, t, dpvc].filter(Boolean).join(' · '),
      invoice: [silver, size && `${size} mm²`, cores && `${cores} Core`, flex, t, dpvc].filter(Boolean).join(' '),
    };
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      const item: Record<string, unknown> = { category, code: code.trim() || null };
      if (existing) item.id = existing.item_id;
      if (UNIT_CHOICES[category]) item.base_unit = baseUnit;
      item.name = nameFromSpecs ? '' : name.trim();
      if (!nameFromSpecs && !name.trim()) throw new Error('Give the item a name.');
      item.invoice_name = customInvoice ? invoiceName.trim() : '';
      if (customInvoice && !invoiceName.trim()) throw new Error('Type the invoice name, or switch back to the built one.');
      if (category === 'other' || category === 'consumable') item.description = description.trim();
      if (category === 'finished_cable') item.source = source;
      const specPayload: Record<string, unknown> = {};
      for (const f of fields) specPayload[f.key] = specs[f.key] || null;
      if (category === 'finished_cable') specPayload.double_pvc = specs.double_pvc === 'true';
      if (category === 'copper') specPayload.form = specs.form || null;
      if (category === 'finished_cable') {
        const missing = CABLE_FIELDS.filter((f) => f.required && !specs[f.key]).map((f) => f.label);
        if (missing.length) throw new Error(`Choose: ${missing.join(', ')}.`);
      }
      const id = await saveItem(item, hasSpecs ? specPayload : null);
      await session.reloadCatalog();
      if (!existing) {
        go(`items/${id}`);
        return;
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
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
            {existing && <div className="hint">Category and unit are fixed once an item exists.</div>}
          </div>
          <div className="field">
            <label htmlFor="it-unit">Stock unit</label>
            {UNIT_CHOICES[category] ? (
              <select id="it-unit" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} disabled={!!existing}>
                {UNIT_CHOICES[category].map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            ) : (
              <input id="it-unit" value={category === 'finished_cable' ? 'ft (shown in each person’s ft / m setting)' : 'kg'} disabled />
            )}
          </div>

          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`it-${f.key}`}>{f.label}</label>
              <select id={`it-${f.key}`} value={specs[f.key] ?? ''} onChange={(e) => setSpecs({ ...specs, [f.key]: e.target.value })}>
                <option value="">{f.required ? 'Choose…' : '—'}</option>
                {optionsOf(f.type).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.value}
                    {!o.active ? ' (hidden)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {category === 'finished_cable' && (
            <>
              <div className="field">
                <span className="label">Double PVC</span>
                <label className="checkbox">
                  <input type="checkbox" checked={specs.double_pvc === 'true'} onChange={(e) => setSpecs({ ...specs, double_pvc: String(e.target.checked) })} />
                  Yes, double PVC
                </label>
              </div>
              <div className="field">
                <label htmlFor="it-source">Source</label>
                <select id="it-source" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="made">Made</option>
                  <option value="bought">Bought</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </>
          )}
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
          {hasSpecs && (
            <div className="field span-2">
              <div className="hint">
                Missing a value? Add it under <a href={href('specs')}>Spec lists</a>.
              </div>
            </div>
          )}

          {hasSpecs && (
            <div className="field span-2">
              <label className="checkbox">
                <input type="checkbox" checked={autoName} onChange={(e) => setAutoName(e.target.checked)} />
                Build the name from the specs
              </label>
              {preview && autoName && <div className="hint">Name: {preview.internal || '—'}</div>}
            </div>
          )}
          {!nameFromSpecs && (
            <div className="field">
              <label htmlFor="it-name">Name (staff)</label>
              <input id="it-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fire alarm cable 1.5 mm" />
            </div>
          )}
          <div className="field">
            <label htmlFor="it-code">Code (optional)</label>
            <input id="it-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SKU" />
          </div>
          <div className="field span-2">
            <label className="checkbox">
              <input type="checkbox" checked={customInvoice} onChange={(e) => setCustomInvoice(e.target.checked)} />
              Type the invoice name myself
            </label>
            {customInvoice ? (
              <input
                aria-label="Invoice name"
                value={invoiceName}
                onChange={(e) => setInvoiceName(e.target.value)}
                placeholder="What customers see on invoices and challans"
                className="invoice-input"
              />
            ) : (
              <div className="hint">
                Invoice name: {preview ? preview.invoice || '—' : nameFromSpecs ? 'built from the specs' : 'same as the name'}
              </div>
            )}
          </div>
          {(category === 'other' || category === 'consumable') && (
            <div className="field span-2">
              <label htmlFor="it-desc">Description (optional)</label>
              <textarea id="it-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          )}
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
      <p className="page-sub card-intro">
        Stock is always kept in {item.base_unit}. Other units only make entry easier, e.g. coil = 300 ft, bag = 25 kg.
        {item.base_unit === 'ft' ? ' Metres are always offered for cable.' : ''}
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      {units.length > 0 && (
        <div className="table-scroll card-intro">
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

function StandardCostCard({ item, current, canSee, onSaved }: { item: Item; current: number | null; canSee: boolean; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState('');
  const action = useAction();
  const isCable = item.category === 'finished_cable';
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      const cost = value.trim() === '' ? null : Number(value);
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Enter 0 or more, or leave blank to clear.');
      await setStandardCost(item.item_id, cost);
      return 'Standard cost saved.';
    });
    if (ok) {
      setValue('');
      await onSaved();
    }
  };
  return (
    <div className="card">
      <div className="section-title">Standard cost</div>
      <p className="page-sub card-intro">
        {isCable
          ? 'Values bundles whose production order isn’t finalized yet. Once Production sets the order cost, those bundles use the real cost.'
          : 'Used when Production adds this item to stock without a cost (part-finished output, scrap).'}
        {canSee ? ` Current: ${current === null ? 'not set' : formatUnitCost(current, item.base_unit)}.` : ''}
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      <form onSubmit={save} noValidate>
        <div className="field narrow-field">
          <label htmlFor="sc-value">Cost per {item.base_unit} (Rs)</label>
          <div className="inline-input">
            <input id="sc-value" type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            <button type="submit" className="btn btn-secondary" disabled={action.busy}>
              Save
            </button>
          </div>
          {isCable && <div className="hint">Always per foot, whatever your ft / m setting.</div>}
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
      <p className="page-sub card-intro">
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
