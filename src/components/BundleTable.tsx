import { formatFeet } from '../format';
import type { Bundle } from '../mockData';
import { stockLevel } from '../stock';
import './BundleTable.css';

interface BundleTableProps {
  bundles: Bundle[];
  /** Bundle to highlight, e.g. after clicking its ID in the cut log. */
  highlightedId: string | null;
}

function RemainingCell({ bundle }: { bundle: Bundle }) {
  const level = stockLevel(bundle);
  if (level === 'depleted') return <span className="remaining-empty">{formatFeet(0)}</span>;

  const pct = Math.round((bundle.remainingFeet / bundle.totalFeet) * 100);
  return (
    <span className="remaining">
      {level === 'low' && <span className="tag low">Low · {pct}%</span>}
      <span className="mono">{formatFeet(bundle.remainingFeet)}</span>
    </span>
  );
}

// Each row's id (`bundle-<bundleId>`) is the scroll target for CutLog's bundle links.
function BundleTable({ bundles, highlightedId }: BundleTableProps) {
  return (
    <div className="card bundle-table">
      <div className="section-title">Bundle stock</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Bundle ID</th>
              <th>Department</th>
              <th>Spec</th>
              <th className="num">Total</th>
              <th className="num">Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((b) => (
              <tr
                key={b.bundleId}
                id={`bundle-${b.bundleId}`}
                className={b.bundleId === highlightedId ? 'highlighted' : undefined}
              >
                <td className="mono">{b.bundleId}</td>
                <td>{b.department}</td>
                <td>{b.spec}</td>
                <td className="mono num">{formatFeet(b.totalFeet)}</td>
                <td className="num">
                  <RemainingCell bundle={b} />
                </td>
                <td>
                  <span className={`tag ${b.status === 'Active' ? 'active' : 'depleted'}`}>{b.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">{bundles.length} bundles</p>
    </div>
  );
}

export default BundleTable;
