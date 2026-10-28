import { useState, type FormEvent } from 'react';
import {
  allUserLocations,
  listAllLocations,
  businessLabel,
  listBusinesses,
  type Business,
  listStaff,
  saveLocation,
  setUserLocations,
  type LocationRow,
} from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { LOCATION_TYPE_LABELS } from '../format';
import { useAction, useAsync } from '../hooks';
import type { Session } from '../session';

/** Locations (manage_locations) and, for the owner, who may change stock where. */
function LocationsPage({ session }: { session: Session }) {
  const canManage = session.can('manage_locations');
  const isOwner = session.user.isOwner;
  const data = useAsync(() => Promise.all([listAllLocations(), listBusinesses()]), []);
  const [editing, setEditing] = useState<LocationRow | 'new' | null>(null);

  const [locations, businesses] = data.data ?? [[], []];
  const businessName = (id: string) => {
    const b = businesses.find((x) => x.id === id);
    return b ? businessLabel(b) : '—';
  };

  const afterSave = async () => {
    setEditing(null);
    data.reload();
    await session.reloadCatalog();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Locations</h1>
          <p className="page-sub">The factory, shops and warehouses. Each belongs to one of the businesses.</p>
        </div>
        {canManage && !editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            Add location
          </button>
        )}
      </div>

      <div className="stack">
        {editing && (
          <LocationForm
            location={editing === 'new' ? null : editing}
            businesses={businesses.filter((b) => b.active)}
            onCancel={() => setEditing(null)}
            onSaved={afterSave}
          />
        )}

        <div className="card">
          {data.error && <Banner kind="error">{data.error}</Banner>}
          {data.loading && !data.data ? (
            <Loading />
          ) : locations.length === 0 ? (
            <Empty>No locations yet. Add the factory and each shop.</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Business</th>
                    <th>Status</th>
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.location_id}>
                      <td>{l.name}</td>
                      <td className="mono">{l.code ?? '—'}</td>
                      <td>{LOCATION_TYPE_LABELS[l.type]}</td>
                      <td>{businessName(l.business_id)}</td>
                      <td>{l.active ? <span className="tag ok">Active</span> : <span className="tag muted">Inactive</span>}</td>
                      {canManage && (
                        <td className="num">
                          <button type="button" className="link-btn" onClick={() => setEditing(l)}>
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isOwner && <LocationAccess session={session} />}
      </div>
    </>
  );
}

function LocationForm({
  location,
  businesses,
  onCancel,
  onSaved,
}: {
  location: LocationRow | null;
  businesses: Business[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(location?.name ?? '');
  const [code, setCode] = useState(location?.code ?? '');
  const [type, setType] = useState<string>(location?.type ?? 'shop');
  const [businessId, setBusinessId] = useState(location?.business_id ?? (businesses.length === 1 ? businesses[0].id : ''));
  const [active, setActive] = useState(location?.active ?? true);
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      if (!name.trim()) throw new Error('Give the location a name.');
      if (!businessId) throw new Error('Choose the business this location belongs to.');
      await saveLocation({ id: location?.location_id ?? null, name: name.trim(), code: code.trim() || null, type, businessId, active });
    });
    if (ok) await onSaved();
  };

  return (
    <div className="card">
      <div className="section-title">{location ? `Edit ${location.name}` : 'New location'}</div>
      <Banner kind="error">{action.error}</Banner>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="loc-name">Name</label>
            <input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arambagh" />
          </div>
          <div className="field">
            <label htmlFor="loc-code">Code (optional)</label>
            <input id="loc-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ARB (used for invoice numbers later)" />
          </div>
          <div className="field">
            <label htmlFor="loc-type">Type</label>
            <select id="loc-type" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(LOCATION_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="loc-business">Business</label>
            <select id="loc-business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">Choose a business</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {businessLabel(b)}
                </option>
              ))}
            </select>
            {businesses.length === 0 && <div className="hint">No businesses yet: the owner adds them in the Portal.</div>}
          </div>
          {location && (
            <div className="field span-2">
              <label className="checkbox">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active (a location must hold no stock to be deactivated)
              </label>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save location'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** Owner only: which locations each employee may adjust, transfer out of, reverse and load opening stock at. */
function LocationAccess({ session }: { session: Session }) {
  const data = useAsync(() => Promise.all([listStaff(), allUserLocations()]), []);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const action = useAction();
  const [staff, assigned] = data.data ?? [[], []];
  const employees = staff.filter((s) => s.role === 'employee' && s.active);

  const current = (userId: string) => draft[userId] ?? assigned.filter((a) => a.user_id === userId).map((a) => a.location_id);
  const dirty = (userId: string) => draft[userId] !== undefined;

  const toggle = (userId: string, locationId: string) => {
    const list = current(userId);
    setDraft({ ...draft, [userId]: list.includes(locationId) ? list.filter((x) => x !== locationId) : [...list, locationId] });
  };

  const save = async (userId: string, name: string) => {
    const ok = await action.run(async () => {
      await setUserLocations(userId, current(userId));
      return `Saved locations for ${name}.`;
    });
    if (ok) {
      const next = { ...draft };
      delete next[userId];
      setDraft(next);
      data.reload();
    }
  };

  return (
    <div className="card">
      <div className="section-title">Location access</div>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        Where each person may change stock: adjust, transfer out, reverse and load opening stock. Everyone with stock access
        can still see every location, and sales can still be made from any location.
      </p>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error || data.error}</Banner>
      {data.loading && !data.data ? (
        <Loading />
      ) : employees.length === 0 ? (
        <Empty>No employees yet.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                {session.locations.map((l) => (
                  <th key={l.location_id} className="num">
                    {l.name}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {employees.map((p) => {
                const name = p.full_name || p.username || 'Employee';
                const list = current(p.user_id);
                return (
                  <tr key={p.user_id}>
                    <td>
                      {name}
                      {p.username && <div className="sub">{p.username}</div>}
                    </td>
                    {session.locations.map((l) => (
                      <td key={l.location_id} className="num">
                        <input
                          type="checkbox"
                          checked={list.includes(l.location_id)}
                          onChange={() => toggle(p.user_id, l.location_id)}
                          aria-label={`${name} may change stock at ${l.name}`}
                        />
                      </td>
                    ))}
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        disabled={!dirty(p.user_id) || action.busy}
                        onClick={() => void save(p.user_id, name)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LocationsPage;
