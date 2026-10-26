import { bundleChildren, bundleHistory, getBundle } from '../api';
import { Banner, Empty, Loading } from '../components/Common';
import { formatDate, formatDateTime, formatQty, formatSigned, MOVEMENT_LABELS } from '../format';
import { useAsync } from '../hooks';
import { go, href } from '../router';
import { itemById, locationName, type Session } from '../session';

const SOURCE_LABELS: Record<string, string> = {
  production: 'Produced',
  purchase: 'Purchased',
  opening: 'Opening stock',
  return: 'Customer return',
  cut: 'Cut from another bundle',
  adjustment: 'Found in a stock count',
};

/** Where a movement came from, in words. */
function sourceText(sourceType: string): string {
  const map: Record<string, string> = {
    sales_invoice: 'Sale',
    sales_credit_note: 'Customer return',
    production_log: 'Production',
    supplier_purchase: 'Supplier purchase',
    supplier_debit_note: 'Return to supplier',
    inventory_transfer: 'Transfer',
    inventory_adjustment: 'Adjustment',
    inventory_opening: 'Opening stock',
  };
  return map[sourceType] ?? sourceType.replace(/_/g, ' ');
}

/** One bundle: its facts, the pieces cut from it, and every movement (produced, moved, cut, sold, returned). */
function BundlePage({ session, bundleId }: { session: Session; bundleId: string | undefined }) {
  const { data, error, loading } = useAsync(async () => {
    if (!bundleId) return null;
    const [bundle, children, history] = await Promise.all([getBundle(bundleId), bundleChildren(bundleId), bundleHistory(bundleId)]);
    const parent = bundle?.parent_bundle_id ? await getBundle(bundle.parent_bundle_id) : null;
    return { bundle, children, history, parent };
  }, [bundleId]);

  if (loading && !data) return <Loading />;
  if (error) return <Banner kind="error">{error}</Banner>;
  const b = data?.bundle;
  if (!b) {
    return (
      <div className="card">
        <h1 className="page-title">Bundle not found</h1>
        <p className="page-sub">
          <a href={href('bundles')}>Back to bundles</a>
        </p>
      </div>
    );
  }
  const item = itemById(session, b.item_id);

  return (
    <>
      <p className="sub">
        <a href={href('bundles')}>Bundles</a> / {b.bundle_no}
      </p>
      <h1 className="page-title mono">{b.bundle_no}</h1>
      <p className="page-sub">
        {item ? <a href={href(`item/${item.item_id}`)}>{item.name}</a> : 'Cable'} · at {locationName(session, b.location_id)}
      </p>

      <div className="facts">
        <div className="fact">
          <div className="fact-label">Remaining</div>
          <div className="fact-value mono">{formatQty(b.remaining_ft, 'ft')}</div>
        </div>
        <div className="fact">
          <div className="fact-label">Original length</div>
          <div className="fact-value mono">{formatQty(b.original_ft, 'ft')}</div>
        </div>
        <div className="fact">
          <div className="fact-label">Origin</div>
          <div className="fact-value" style={{ fontSize: 15 }}>
            {SOURCE_LABELS[b.source_type] ?? b.source_type}
          </div>
        </div>
        <div className="fact">
          <div className="fact-label">Cost</div>
          <div className="fact-value" style={{ fontSize: 15 }}>
            {b.cost_status === 'final' ? 'Final' : 'Pending (order not finalized)'}
          </div>
        </div>
        {b.production_order_id && (
          <div className="fact">
            <div className="fact-label">Production order</div>
            <div className="fact-value mono" style={{ fontSize: 14 }} title={b.production_order_id}>
              {b.production_order_id.slice(0, 8)}
            </div>
          </div>
        )}
      </div>

      <div className="stack">
        {(data.parent || data.children.length > 0) && (
          <div className="card">
            <div className="section-title">Related bundles</div>
            {data.parent && (
              <p className="page-sub" style={{ marginBottom: 12 }}>
                Cut from <a href={href(`bundle/${data.parent.id}`)}>{data.parent.bundle_no}</a>
              </p>
            )}
            {data.children.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Piece</th>
                      <th>Location</th>
                      <th className="num">Remaining</th>
                      <th className="num">Cut length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.children.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => go(`bundle/${c.id}`)}>
                        <td className="mono">{c.bundle_no}</td>
                        <td>{locationName(session, c.location_id)}</td>
                        <td className="mono num">{formatQty(c.remaining_ft, 'ft')}</td>
                        <td className="mono num">{formatQty(c.original_ft, 'ft')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="section-title">History (this bundle and pieces cut from it)</div>
          {data.history.length === 0 ? (
            <Empty>No movements.</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bundle</th>
                    <th>What happened</th>
                    <th>Location</th>
                    <th className="num">Change</th>
                    <th>Document</th>
                    <th>Reason / note</th>
                    <th>Entered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.movement_id}>
                      <td className="mono">{formatDate(h.movement_date)}</td>
                      <td className="mono">{h.bundle_no}</td>
                      <td>{MOVEMENT_LABELS[h.movement_type] ?? h.movement_type}</td>
                      <td>{h.location_name}</td>
                      <td className={`mono num ${h.quantity > 0 ? 'pos' : 'neg'}`}>{formatSigned(h.quantity, 'ft')}</td>
                      <td className="sub" title={h.source_id ?? undefined}>
                        {sourceText(h.source_type)}
                        {h.source_id ? ` ${h.source_id.slice(0, 8)}` : ''}
                      </td>
                      <td className="wrap">{[h.reason, h.note].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="sub">{formatDateTime(h.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default BundlePage;
