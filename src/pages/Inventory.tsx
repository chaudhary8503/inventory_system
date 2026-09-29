import { useState } from 'react';
import BundleTable from '../components/BundleTable';
import CutForm, { type NewCut } from '../components/CutForm';
import CutLog from '../components/CutLog';
import SummaryStrip from '../components/SummaryStrip';
import { isoToday } from '../format';
import { type Bundle, type CutRecord, INITIAL_BUNDLES, INITIAL_CUTS, SHOPS } from '../mockData';

// All state is local and resets on reload — this is a frontend-only demo.
function Inventory() {
  const [bundles, setBundles] = useState<Bundle[]>(INITIAL_BUNDLES);
  const [cuts, setCuts] = useState<CutRecord[]>(INITIAL_CUTS);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const recordCut = ({ bundleId, feetCut, destinationShop }: NewCut): number => {
    const bundle = bundles.find((b) => b.bundleId === bundleId)!;
    const remainingFeet = bundle.remainingFeet - feetCut;

    setBundles(
      bundles.map((b) =>
        b.bundleId === bundleId
          ? { ...b, remainingFeet, status: remainingFeet === 0 ? 'Depleted' : 'Active' }
          : b,
      ),
    );
    setCuts([
      ...cuts,
      {
        cutId: `CUT-${String(cuts.length + 1).padStart(4, '0')}`,
        bundleId,
        feetCut,
        destinationShop,
        date: isoToday(),
        remainingFeetAfterCut: remainingFeet,
      },
    ]);

    return remainingFeet;
  };

  const showBundle = (bundleId: string) => {
    setHighlightedId(bundleId);
    document.getElementById(`bundle-${bundleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <h1 className="page-title">Inventory</h1>
      <p className="page-sub">Finished cable stock by bundle, tracked in feet, and the cuts sent to each shop.</p>

      <SummaryStrip bundles={bundles} />

      <CutForm bundles={bundles.filter((b) => b.status === 'Active')} shops={SHOPS} onSubmit={recordCut} />

      <BundleTable bundles={bundles} highlightedId={highlightedId} />

      <CutLog cuts={cuts} onBundleClick={showBundle} />
    </>
  );
}

export default Inventory;
