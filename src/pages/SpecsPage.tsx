import { useState, type FormEvent } from 'react';
import { listSpecOptions, saveSpecOption, type SpecOption, type SpecType } from '../api';
import { Banner, Loading } from '../components/Common';
import { useAction, useAsync } from '../hooks';
import type { Session } from '../session';

const SPEC_TYPES: { type: SpecType; label: string; example: string }[] = [
  { type: 'mm2', label: 'Size (mm²)', example: 'e.g. 2.5' },
  { type: 'cores', label: 'Cores', example: 'e.g. 3' },
  { type: 'wires', label: 'Wires (strands)', example: 'e.g. 7' },
  { type: 'thou', label: 'Thou', example: 'e.g. 29' },
  { type: 'cable_type', label: 'Cable type', example: 'Flexible / Standard' },
  { type: 'pvc_colour', label: 'PVC colour', example: 'e.g. Red' },
  { type: 'pvc_grade', label: 'PVC grade', example: '1, 2 or 3' },
];

/** The dropdown lists used to describe items. New sizes never need a developer. */
function SpecsPage({ session }: { session: Session }) {
  const { data, error, loading, reload } = useAsync(listSpecOptions, []);
  const [type, setType] = useState<SpecType>('mm2');
  const options = (data ?? []).filter((o) => o.spec_type === type);
  const meta = SPEC_TYPES.find((t) => t.type === type)!;

  return (
    <>
      <h1 className="page-title">Spec lists</h1>
      <p className="page-sub">
        The values offered in the item form. Cable names are built from them, e.g. "2.5 mm² · 3-core · 7/29 · Flexible".
      </p>
      <div className="card">
        <div className="filters" role="tablist" aria-label="Spec list">
          {SPEC_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              role="tab"
              aria-selected={t.type === type}
              className={`btn btn-small ${t.type === type ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setType(t.type)}
              style={{ flex: '0 0 auto' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : (
          <SpecList key={type} type={type} example={meta.example} options={options} onSaved={reload} canEdit={session.can('manage_items')} />
        )}
      </div>
    </>
  );
}

function SpecList({
  type,
  example,
  options,
  onSaved,
  canEdit,
}: {
  type: SpecType;
  example: string;
  options: SpecOption[];
  onSaved: () => void;
  canEdit: boolean;
}) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editOrder, setEditOrder] = useState('0');
  const action = useAction();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      if (!value.trim()) throw new Error('Type a value first.');
      const nextOrder = options.reduce((m, o) => Math.max(m, o.sort_order), 0) + 1;
      await saveSpecOption({ id: null, spec_type: type, value: value.trim(), sort_order: nextOrder, active: true });
      return `Added "${value.trim()}".`;
    });
    if (ok) {
      setValue('');
      onSaved();
    }
  };

  const saveEdit = async (o: SpecOption) => {
    const ok = await action.run(async () => {
      await saveSpecOption({ id: o.id, spec_type: type, value: editValue.trim(), sort_order: Number(editOrder) || 0, active: o.active });
      return 'Saved. Item names already built from this value keep their old name until rebuilt.';
    });
    if (ok) {
      setEditing(null);
      onSaved();
    }
  };

  const toggle = (o: SpecOption) =>
    void action
      .run(async () => {
        await saveSpecOption({ ...o, active: !o.active });
        return o.active ? `"${o.value}" hidden from the item form.` : `"${o.value}" is offered again.`;
      })
      .then((ok) => ok && onSaved());

  return (
    <>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      {canEdit && (
        <form onSubmit={add} noValidate style={{ maxWidth: 420, marginBottom: 18 }}>
          <div className="field">
            <label htmlFor="spec-new">Add a value</label>
            <div className="inline-input">
              <input id="spec-new" value={value} onChange={(e) => setValue(e.target.value)} placeholder={example} />
              <button type="submit" className="btn btn-primary" disabled={action.busy}>
                Add
              </button>
            </div>
          </div>
        </form>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Value</th>
              <th className="num">Order</th>
              <th>Status</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {options.length === 0 && (
              <tr>
                <td colSpan={4} className="sub">
                  No values yet.
                </td>
              </tr>
            )}
            {options.map((o) => (
              <tr key={o.id}>
                <td>
                  {editing === o.id ? (
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)} aria-label="Value" className="cell-input" />
                  ) : (
                    o.value
                  )}
                </td>
                <td className="mono num">
                  {editing === o.id ? (
                    <input type="number" value={editOrder} onChange={(e) => setEditOrder(e.target.value)} aria-label="Order" className="cell-input narrow" />
                  ) : (
                    o.sort_order
                  )}
                </td>
                <td>{o.active ? <span className="tag ok">Offered</span> : <span className="tag muted">Hidden</span>}</td>
                {canEdit && (
                  <td className="num">
                    {editing === o.id ? (
                      <span className="form-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-primary btn-small" disabled={action.busy} onClick={() => void saveEdit(o)}>
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="form-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setEditing(o.id);
                            setEditValue(o.value);
                            setEditOrder(String(o.sort_order));
                            action.clear();
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="link-btn" onClick={() => toggle(o)}>
                          {o.active ? 'Hide' : 'Offer again'}
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default SpecsPage;
