import { formatDate, formatFeet } from '../format';
import type { CutRecord } from '../mockData';
import './CutLog.css';

interface CutLogProps {
  cuts: CutRecord[];
  /** Called when a bundle ID is clicked, to jump to that bundle. */
  onBundleClick: (bundleId: string) => void;
}

function CutLog({ cuts, onBundleClick }: CutLogProps) {
  // Most recent first. Cut IDs increase over time, so they break same-day ties.
  const rows = [...cuts].sort((a, b) => b.date.localeCompare(a.date) || b.cutId.localeCompare(a.cutId));

  return (
    <div className="card">
      <div className="section-title">Cut log</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Bundle</th>
              <th className="num">Feet cut</th>
              <th>Destination</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.cutId}>
                <td className="mono">{formatDate(c.date)}</td>
                <td>
                  <button
                    type="button"
                    className="bundle-link mono"
                    title="Show this bundle"
                    onClick={() => onBundleClick(c.bundleId)}
                  >
                    {c.bundleId}
                  </button>
                </td>
                <td className="mono num">{formatFeet(c.feetCut)}</td>
                <td>{c.destinationShop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        {rows.length} {rows.length === 1 ? 'cut' : 'cuts'}
      </p>
    </div>
  );
}

export default CutLog;
