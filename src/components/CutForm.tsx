import { useState } from 'react';
import { formatFeet } from '../format';
import type { Bundle } from '../mockData';
import './CutForm.css';

export interface NewCut {
  bundleId: string;
  feetCut: number;
  destinationShop: string;
}

interface CutFormProps {
  /** Bundles that can still be cut from (Active only). */
  bundles: Bundle[];
  shops: string[];
  /** Records the cut and returns the bundle's remaining feet afterwards. */
  onSubmit: (cut: NewCut) => number;
}

function CutForm({ bundles, shops, onSubmit }: CutFormProps) {
  const [bundleId, setBundleId] = useState('');
  const [feet, setFeet] = useState('');
  const [shop, setShop] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const bundle = bundles.find((b) => b.bundleId === bundleId);
  const feetCut = Number(feet);

  let error: string | null = null;
  if (feet !== '' && !(Number.isInteger(feetCut) && feetCut > 0)) {
    error = 'Enter a whole number of feet, greater than 0.';
  } else if (bundle && feetCut > bundle.remainingFeet) {
    error = `Only ${formatFeet(bundle.remainingFeet)} left on ${bundle.bundleId} — you can't cut more than that.`;
  }

  const canSubmit = Boolean(bundle && feet !== '' && shop && !error);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !bundle) return;

    const left = onSubmit({ bundleId: bundle.bundleId, feetCut, destinationShop: shop });
    setResult(
      `Cut ${formatFeet(feetCut)} from ${bundle.bundleId} for ${shop}. ` +
        (left === 0 ? `${bundle.bundleId} is now depleted.` : `${formatFeet(left)} left.`),
    );
    setBundleId('');
    setFeet('');
    setShop('');
  };

  // Any edit starts a new entry, so the previous confirmation no longer applies.
  const edit = (setter: (value: string) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value);
    setResult(null);
  };

  return (
    <div className="card cut-form">
      <div className="section-title">Record a cut</div>
      <form onSubmit={handleSubmit} noValidate>
        <div className="cut-row">
          <div className="field">
            <label htmlFor="cut-bundle">Bundle</label>
            <select id="cut-bundle" value={bundleId} onChange={edit(setBundleId)}>
              <option value="" disabled>
                Select a bundle
              </option>
              {bundles.map((b) => (
                <option key={b.bundleId} value={b.bundleId}>
                  {b.bundleId} — {b.department}, {b.spec} ({formatFeet(b.remainingFeet)} left)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cut-feet">Feet to cut</label>
            <input
              id="cut-feet"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder={bundle ? `Up to ${bundle.remainingFeet}` : 'e.g. 250'}
              value={feet}
              onChange={edit(setFeet)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'cut-feet-error' : undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="cut-shop">Destination shop</label>
            <select id="cut-shop" value={shop} onChange={edit(setShop)}>
              <option value="" disabled>
                Select a shop
              </option>
              {shops.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p id="cut-feet-error" className="field-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="submit" disabled={!canSubmit}>
          Record cut
        </button>

        {result && (
          <div className="result-banner ok" role="status">
            {result}
          </div>
        )}
      </form>
    </div>
  );
}

export default CutForm;
