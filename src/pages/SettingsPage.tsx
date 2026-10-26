import { useState, type FormEvent } from 'react';
import { getSettings, updateSettings, type Settings } from '../api';
import { Banner, Loading } from '../components/Common';
import { FT_PER_M, getLengthUnit, M_PER_FT } from '../format';
import { useAction, useAsync } from '../hooks';

const FIELDS: { key: keyof Settings; label: string; unit: string }[] = [
  { key: 'large_adjustment_threshold_kg', label: 'Copper, PVC and other kg items', unit: 'kg' },
  { key: 'large_adjustment_threshold_ft', label: 'Finished cable', unit: 'ft' }, // shown in m for metre people
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
        Large-adjustment alert thresholds, and the reasons offered when adjusting stock.
      </p>
      <div className="card">
        <Banner kind="error">{error}</Banner>
        {loading && !data ? <Loading /> : data ? <SettingsForm initial={data} /> : null}
      </div>
    </>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const metres = getLengthUnit() === 'm';
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v = Object.fromEntries(
      Object.entries(initial)
        .filter(([k]) => k !== 'adjustment_reasons')
        .map(([k, x]) => [k, String(x)]),
    );
    if (metres) v.large_adjustment_threshold_ft = String(Math.round(initial.large_adjustment_threshold_ft * M_PER_FT * 1000) / 1000);
    return v;
  });
  const [reasons, setReasons] = useState(initial.adjustment_reasons.join('\n'));
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await action.run(async () => {
      const numbers = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]));
      if (Object.values(numbers).some((v) => !Number.isFinite(v) || v < 0)) throw new Error('Every value must be 0 or more.');
      if (metres) numbers.large_adjustment_threshold_ft = Math.round(numbers.large_adjustment_threshold_ft * FT_PER_M * 1000) / 1000;
      const list = reasons.split('\n').map((r) => r.trim()).filter(Boolean);
      if (list.length === 0) throw new Error('Keep at least one adjustment reason.');
      const parsed = { ...numbers, adjustment_reasons: list } as unknown as Settings;
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
                <span className="unit-label">{f.unit === 'ft' && metres ? 'm' : f.unit}</span>
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
        <div className="field reasons-field">
          <label htmlFor="set-reasons">Adjustment reasons (one per line)</label>
          <textarea id="set-reasons" rows={7} value={reasons} onChange={(e) => setReasons(e.target.value)} />
          <div className="hint">Offered on the Adjust page; people can still type another reason. Use "Discarded" for scrap thrown away.</div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </>
  );
}

export default SettingsPage;
