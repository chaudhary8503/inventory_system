import { useEffect } from 'react';
import { getChallan } from '../api';
import { Banner, Loading } from '../components/Common';
import { formatDate, formatQty, formatWithCoils } from '../format';
import { useAsync } from '../hooks';
import { href } from '../router';
import './ChallanPage.css';

/** Printable A4 delivery challan. Opened with ?print=1 right after saving a transfer. */
function ChallanPage({ challanId, autoPrint }: { challanId: string | undefined; autoPrint: boolean }) {
  const { data: c, error, loading } = useAsync(() => (challanId ? getChallan(challanId) : Promise.reject(new Error('No challan.'))), [challanId]);

  useEffect(() => {
    if (c && autoPrint) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [c, autoPrint]);

  if (loading && !c) return <Loading />;
  if (error || !c) return <Banner kind="error">{error ?? 'Challan not found.'}</Banner>;

  return (
    <>
      <div className="challan-toolbar no-print">
        <a href={href('challans')}>← All challans</a>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>
      {autoPrint && (
        <div className="no-print">
          <Banner kind="ok">Transfer saved as challan {c.challan_no}.</Banner>
        </div>
      )}

      <article className="challan">
        {c.cancelled && <div className="challan-cancelled">CANCELLED</div>}
        <header className="challan-head">
          <div>
            <div className="challan-business">{c.business?.name ?? 'Powerant'}</div>
            {c.business?.legal_name && c.business.legal_name !== c.business.name && <div className="challan-small">{c.business.legal_name}</div>}
            {c.business?.address && <div className="challan-small">{c.business.address}</div>}
            {c.business?.phone && <div className="challan-small">Phone: {c.business.phone}</div>}
          </div>
          <div className="challan-title">
            <div className="challan-doc">DELIVERY CHALLAN</div>
            <div className="challan-no mono">{c.challan_no}</div>
            <div className="challan-small">Date: {formatDate(c.date)}</div>
          </div>
        </header>

        <section className="challan-parties">
          <div>
            <div className="challan-label">From</div>
            <div className="challan-strong">{c.from.name}</div>
          </div>
          <div>
            <div className="challan-label">To</div>
            <div className="challan-strong">{c.to.name}</div>
          </div>
          <div>
            <div className="challan-label">Vehicle</div>
            <div>{c.vehicle_no ?? '—'}</div>
          </div>
          <div>
            <div className="challan-label">Driver</div>
            <div>{c.driver_name ?? '—'}</div>
          </div>
        </section>

        <table className="challan-lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th className="num">Quantity</th>
              <th>Bundle</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={`${l.item_id}-${i}`} className={l.reversed ? 'reversed' : undefined}>
                <td>{i + 1}</td>
                <td>{l.invoice_name}</td>
                <td className="num">{l.base_unit === 'ft' ? formatWithCoils(l.quantity, l.coil_ft) : formatQty(l.quantity, l.base_unit)}</td>
                <td className="mono">
                  {l.from_bundle ? (l.to_bundle && l.to_bundle !== l.from_bundle ? `${l.to_bundle} (cut from ${l.from_bundle})` : l.from_bundle) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {c.note && <p className="challan-note">Note: {c.note}</p>}

        <footer className="challan-sign">
          <div>
            <div className="challan-line" />
            Sent by{c.created_by ? ` (${c.created_by})` : ''}
          </div>
          <div>
            <div className="challan-line" />
            Received by
          </div>
        </footer>
      </article>
    </>
  );
}

export default ChallanPage;
