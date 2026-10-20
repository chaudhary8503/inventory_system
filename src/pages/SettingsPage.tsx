import { useState, type FormEvent } from 'react';
import { getSettings, updateSettings, type Settings } from '../api';
import { Banner, Loading } from '../components/Common';
import { useAction, useAsync } from '../hooks';

const FIELDS: { key: keyof Settings; label: string; unit: string }[] = [
  { key: 'large_adjustment_threshold_kg', label: 'Copper, PVC and other kg items', unit: 'kg' },
  { key: 'large_adjustment_threshold_ft', label: 'Finished cable', unit: 'ft' },
  { key: 'large_adjustment_threshold_m', label: 'Rope and other metre items', unit: 'm' },
  { key: 'large_adjustment_threshold_pcs', label: 'Items counted in pieces', unit: 'pcs' },
];

/** Alert thresholds for the owner's "large adjustment" review. */
function SettingsPage() {
  const { data, error, loading } = useAsync(getSettings, []);
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        A stock adjustment bigger than these amounts shows on the Portal overview as "Large adjustment" for review.
      </p>
      <div className="card">
        <Banner kind="error">{error}</Banner>
        {loading && !data ? <Loading /> : data ? <SettingsForm initial={data} /> : null}
      </div>
    </>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])),
  );
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await action.run(async () => {
      const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) as unknown as Settings;
      if (Object.values(parsed).some((v) => !Number.isFinite(v) || v < 0)) throw new Error('Every value must be 0 or more.');
      if (parsed.large_adjustment_window_days < 1 || parsed.large_adjustment_window_days > 365)
        throw new Error('The review window must be between 1 and 365 days.');
      await updateSettings(parsed);
      return 'Settings saved.';
    });
  };

  return (
    <>
      <Banner kind="ok">{action.done}</Banner>
      <Banner kind="error">{action.error}</Banner>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`set-${f.key}`}>{f.label}</label>
              <div className="inline-input">
                <input
                  id={`set-${f.key}`}
                  type="number"
                  min={0}
                  step="any"
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
                <span className="unit-label">{f.unit}</span>
              </div>
            </div>
          ))}
          <div className="field">
            <label htmlFor="set-window">Show large adjustments for (days)</label>
            <input
              id="set-window"
              type="number"
              min={1}
              max={365}
              value={values.large_adjustment_window_days ?? ''}
              onChange={(e) => setValues({ ...values, large_adjustment_window_days: e.target.value })}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </>
  );
}

export default SettingsPage;
