import { useState, type FormEvent } from 'react';
import {
  groupMinLevelTotals,
  listGroupMinLevels,
  listSpecOptions,
  saveGroupMinLevel,
  type Category,
  type GroupMinLevel,
  type SpecOption,
  type SpecType,
} from '../api';
import { Banner, Empty, Loading, LocationSelect } from '../components/Common';
import { CATEGORY_LABELS, CATEGORY_ORDER, formatQty, FT_PER_M, getLengthUnit, shownAmount, shownUnit } from '../format';
import { useAction, useAsync } from '../hooks';
import { locationName, type Session } from '../session';

/** Which spec filters make sense for each category. */
const FILTERS: Partial<Record<Category, { type: SpecType; label: string }[]>> = {
  finished_cable: [
    { type: 'material', label: 'Material' },
    { type: 'flex_standard', label: 'Flexible / Standard' },
    { type: 'cable_type', label: 'Cable type' },
    { type: 'mm2', label: 'Size (mm²)' },
    { type: 'cores', label: 'Cores' },
  ],
  copper: [{ type: 'copper_grade', label: 'Copper grade' }],
  pvc: [
    { type: 'pvc_colour', label: 'Colour' },
    { type: 'pvc_grade', label: 'Grade' },
  ],
};
const FIXED_UNIT: Partial<Record<Category, string>> = {
  copper: 'kg',
  pvc: 'kg',
  semi_finished: 'kg',
  scrap: 'kg',
  finished_cable: 'ft',
};

/**
 * Group minimum levels: alert when the total of a group (e.g. all grade 99
 * copper, all Flat cable, all Silver cable) falls below a minimum, for the
 * whole company or one location. Per-item reorder levels stay on each item.
 */
function MinimumsPage({ session, focus }: { session: Session; focus: string | null }) {
  const data = useAsync(() => Promise.all([listGroupMinLevels(), groupMinLevelTotals(), listSpecOptions()]), []);
  const [editing, setEditing] = useState<GroupMinLevel | 'new' | null>(null);
  const canEdit = session.can('manage_items');
  const [groups, totals, options] = data.data ?? [[], new Map<string, number>(), [] as SpecOption[]];
  const optionName = (id: unknown) => options.find((o) => o.id === id)?.value ?? '?';

  const describe = (g: GroupMinLevel) =>
    [
      CATEGORY_LABELS[g.category],
      ...Object.entries(g.filters).map(([k, v]) => (k === 'double_pvc' ? (v ? 'Double PVC' : 'Single PVC') : optionName(v))),
    ].join(' · ');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Minimum levels</h1>
          <p className="page-sub">
            Alerts when a whole group runs low, e.g. all grade 99 copper, or all Flat cable at one shop. Each item's own
            reorder level is set on its stock page.
          </p>
        </div>
        {canEdit && !editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            Add minimum level
          </button>
        )}
      </div>
      <div className="stack">
        {editing && (
          <GroupForm
            session={session}
            group={editing === 'new' ? null : editing}
            options={options}
            onDone={() => {
              setEditing(null);
              data.reload();
            }}
          />
        )}
        <div className="card">
          {data.error && <Banner kind="error">{data.error}</Banner>}
          {data.loading && !data.data ? (
            <Loading />
          ) : groups.length === 0 ? (
            <Empty>No minimum levels yet.</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Group</th>
                    <th>Where</th>
                    <th className="num">In stock</th>
                    <th className="num">Minimum</th>
                    <th>Status</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const total = totals.get(g.id) ?? 0;
                    const low = g.active && total < g.min_quantity;
                    return (
                      <tr key={g.id} className={g.id === focus ? 'highlighted' : undefined}>
                        <td>{g.name}</td>
                        <td className="wrap">{describe(g)}</td>
                        <td>{g.location_id ? locationName(session, g.location_id) : 'All locations'}</td>
                        <td className={`mono num ${low ? 'qty-low' : ''}`}>{formatQty(total, g.base_unit)}</td>
                        <td className="mono num">{formatQty(g.min_quantity, g.base_unit)}</td>
                        <td>
                          {!g.active ? <span className="tag muted">Off</span> : low ? <span className="tag low">Below minimum</span> : <span className="tag ok">OK</span>}
                        </td>
                        {canEdit && (
                          <td className="num">
                            <button type="button" className="link-btn" onClick={() => setEditing(g)}>
                              Edit
                            </button>
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
      </div>
    </>
  );
}

function GroupForm({
  session,
  group,
  options,
  onDone,
}: {
  session: Session;
  group: GroupMinLevel | null;
  options: SpecOption[];
  onDone: () => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [category, setCategory] = useState<Category>(group?.category ?? 'copper');
  const [unit, setUnit] = useState(group?.base_unit ?? 'pcs');
  const [locationId, setLocationId] = useState(group?.location_id ?? '');
  const [filters, setFilters] = useState<Record<string, string | boolean>>(group?.filters ?? {});
  const fixedUnit = FIXED_UNIT[category];
  const effectiveUnit = fixedUnit ?? unit;
  const [minimum, setMinimum] = useState(group ? String(Math.round(shownAmount(group.min_quantity, group.base_unit) * 1000) / 1000) : '');
  const [active, setActive] = useState(group?.active ?? true);
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      const shown = Number(minimum);
      if (!Number.isFinite(shown) || shown < 0) throw new Error('Enter a minimum of 0 or more.');
      const base = effectiveUnit === 'ft' && getLengthUnit() === 'm' ? shown * FT_PER_M : shown;
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined));
      await saveGroupMinLevel({
        id: group?.id ?? null,
        name: name.trim(),
        category,
        baseUnit: fixedUnit ? null : unit,
        locationId: locationId || null,
        filters: clean,
        minQuantity: Math.round(base * 1000) / 1000,
        active,
      });
    });
    if (ok) onDone();
  };

  return (
    <div className="card">
      <div className="section-title">{group ? `Edit "${group.name}"` : 'New minimum level'}</div>
      <Banner kind="error">{action.error}</Banner>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="g-name">Name</label>
            <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 99 copper" />
          </div>
          <div className="field">
            <label htmlFor="g-cat">Category</label>
            <select
              id="g-cat"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as Category);
                setFilters({});
              }}
            >
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          {(FILTERS[category] ?? []).map((f) => (
            <div className="field" key={f.type}>
              <label htmlFor={`g-${f.type}`}>{f.label}</label>
              <select
                id={`g-${f.type}`}
                value={String(filters[f.type] ?? '')}
                onChange={(e) => setFilters({ ...filters, [f.type]: e.target.value })}
              >
                <option value="">Any</option>
                {options
                  .filter((o) => o.spec_type === f.type)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.value}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          {category === 'finished_cable' && (
            <div className="field">
              <label htmlFor="g-dpvc">Double PVC</label>
              <select
                id="g-dpvc"
                value={filters.double_pvc === undefined ? '' : String(filters.double_pvc)}
                onChange={(e) => {
                  const next = { ...filters };
                  if (e.target.value === '') delete next.double_pvc;
                  else next.double_pvc = e.target.value === 'true';
                  setFilters(next);
                }}
              >
                <option value="">Any</option>
                <option value="true">Double PVC only</option>
                <option value="false">Single PVC only</option>
              </select>
            </div>
          )}
          {!fixedUnit && (
            <div className="field">
              <label htmlFor="g-unit">Counted in</label>
              <select id="g-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {['pcs', 'roll', 'kg', 'm', 'ft'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <div className="hint">Only items kept in this unit are added up.</div>
            </div>
          )}
          <div className="field">
            <label htmlFor="g-loc">Where</label>
            <LocationSelect id="g-loc" locations={session.locations} value={locationId} onChange={setLocationId} placeholder="All locations (company total)" />
          </div>
          <div className="field">
            <label htmlFor="g-min">Minimum ({shownUnit(effectiveUnit)})</label>
            <input id="g-min" type="number" min={0} step="any" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
          </div>
          {group && (
            <div className="field">
              <span className="label">Status</span>
              <label className="checkbox">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Alert when below the minimum
              </label>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default MinimumsPage;
