import { formatFeet } from '../format';
import type { Bundle } from '../mockData';
import { LOW_STOCK_RATIO, stockLevel } from '../stock';
import './SummaryStrip.css';

interface SummaryStripProps {
  bundles: Bundle[];
}

function sumFeet(bundles: Bundle[]): number {
  return bundles.reduce((total, b) => total + b.remainingFeet, 0);
}

// Same card look as sales_dashboard's KpiCard.
function KpiCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value mono${warn ? ' warn' : ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function SummaryStrip({ bundles }: SummaryStripProps) {
  const active = bundles.filter((b) => b.status === 'Active').length;
  const depleted = bundles.length - active;
  const low = bundles.filter((b) => stockLevel(b) === 'low').length;
  const cable = sumFeet(bundles.filter((b) => b.department === 'Cable'));
  const pvc = sumFeet(bundles.filter((b) => b.department === 'PVC'));

  return (
    <div className="summary-strip">
      <KpiCard label="Active bundles" value={String(active)} sub={`${depleted} depleted`} />
      <KpiCard
        label="Remaining stock"
        value={formatFeet(cable + pvc)}
        sub={`Cable ${formatFeet(cable)} · PVC ${formatFeet(pvc)}`}
      />
      <KpiCard
        label="Low stock bundles"
        value={String(low)}
        sub={`Under ${LOW_STOCK_RATIO * 100}% of original length left`}
        warn={low > 0}
      />
    </div>
  );
}

export default SummaryStrip;
