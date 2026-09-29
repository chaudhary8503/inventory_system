/*
  ============================================================================
  TEMPORARY MOCK DATA — NOT REAL STOCK.
  ============================================================================
  This whole file is a stand-in until the inventory backend exists. To go
  live, replace `INITIAL_BUNDLES` / `INITIAL_CUTS` with API calls (e.g.
  `/api/bundles`, `/api/cuts`) returning the same `Bundle` / `CutRecord`
  shapes, and delete everything below the types and constants.

  Bundles are hand-written; cut records are generated from a fixed seed so
  they're identical on every load. Each bundle's cuts add up exactly to
  totalFeet − remainingFeet, and remainingFeetAfterCut chains correctly.
  Dates are anchored to "today" so the cut log always covers the last 30 days.
*/

export type Department = 'Cable' | 'PVC';
export type BundleStatus = 'Active' | 'Depleted';

/** One continuous length of finished cable from a single production run. */
export interface Bundle {
  bundleId: string;
  department: Department;
  /** Gauge/size description, e.g. "7/0.029 · 2-core". */
  spec: string;
  totalFeet: number;
  remainingFeet: number;
  /** Local date, YYYY-MM-DD. */
  dateProduced: string;
  /** 'Depleted' once remainingFeet reaches 0. */
  status: BundleStatus;
}

/** Length cut from one bundle and sent to a shop. */
export interface CutRecord {
  cutId: string;
  bundleId: string;
  feetCut: number;
  destinationShop: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  remainingFeetAfterCut: number;
}

// Same shop names as sales_dashboard's LOCATIONS (minus Main Branch, which
// sells from the factory rather than receiving cut lengths).
export const SHOPS = ['Shop 1', 'Shop 2', 'Shop 3', 'Shop 4'];

// ---------------------------------------------------------------------------
// Mock generator — delete when the real API is wired up.
// ---------------------------------------------------------------------------

// Small deterministic PRNG (mulberry32), same as sales_dashboard's mock data.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260928);

function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Shop 1 takes the most stock, Shop 4 the least.
const SHOP_WEIGHTS = [34, 28, 22, 16];

function pickShop(): string {
  let r = rand() * 100;
  for (let i = 0; i < SHOPS.length; i++) {
    r -= SHOP_WEIGHTS[i];
    if (r <= 0) return SHOPS[i];
  }
  return SHOPS[SHOPS.length - 1];
}

// [bundleId, department, spec, totalFeet, remainingFeet, producedDaysAgo, cutCount]
type BundleSeed = [string, Department, string, number, number, number, number];

const BUNDLE_SEEDS: BundleSeed[] = [
  ['BND-101', 'Cable', '7/0.029 · 2-core', 3000, 0, 38, 4],
  ['BND-102', 'Cable', '7/0.036 · 3-core', 2500, 180, 35, 4],
  ['BND-103', 'Cable', '3/.029 · single core', 4000, 1650, 31, 4],
  ['BND-104', 'Cable', '7/0.044 · 2-core', 2000, 0, 29, 3],
  ['BND-105', 'Cable', '7/0.052 · 4-core', 1500, 1140, 24, 2],
  ['BND-106', 'Cable', '23/0.0076 flexible · 3-core', 3000, 2460, 18, 3],
  ['BND-107', 'Cable', '7/0.029 · 2-core', 3000, 390, 26, 4],
  ['BND-108', 'Cable', '7/0.036 · 3-core', 2500, 2500, 3, 0],
  ['BND-109', 'Cable', '7/0.064 · single core', 2000, 1880, 9, 1],
  ['BND-110', 'Cable', '3/.029 · single core', 4000, 3720, 6, 2],
  ['BND-201', 'PVC', '1.5 mm² · Red', 5000, 0, 36, 4],
  ['BND-202', 'PVC', '1.5 mm² · Black', 5000, 620, 30, 4],
  ['BND-203', 'PVC', '2.5 mm² · Red', 4000, 2280, 22, 3],
  ['BND-204', 'PVC', '2.5 mm² · Black', 4000, 3610, 12, 2],
  ['BND-205', 'PVC', '4.0 mm² · Yellow', 3000, 1320, 27, 3],
  ['BND-206', 'PVC', '6.0 mm² · Green', 2500, 2270, 15, 1],
  ['BND-207', 'PVC', '1.5 mm² · Blue', 5000, 4880, 4, 1],
  ['BND-208', 'PVC', '2.5 mm² · White', 4000, 4000, 1, 0],
];

/** Splits `used` feet into `count` random pieces, each a multiple of 10. */
function splitFeet(used: number, count: number): number[] {
  const weights = Array.from({ length: count }, () => 0.5 + rand());
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pieces = weights.slice(0, -1).map((w) => Math.round((used * w) / totalWeight / 10) * 10);
  pieces.push(used - pieces.reduce((a, b) => a + b, 0));
  return pieces;
}

function generate(): { bundles: Bundle[]; cuts: CutRecord[] } {
  const bundles: Bundle[] = [];
  const pending: Omit<CutRecord, 'cutId'>[] = [];

  for (const [bundleId, department, spec, totalFeet, remainingFeet, producedDaysAgo, cutCount] of BUNDLE_SEEDS) {
    bundles.push({
      bundleId,
      department,
      spec,
      totalFeet,
      remainingFeet,
      dateProduced: isoDaysAgo(producedDaysAgo),
      status: remainingFeet === 0 ? 'Depleted' : 'Active',
    });

    if (cutCount === 0) continue;

    // Cuts fall between the day after production and today, capped to the
    // last 30 days; oldest first so the running remainder is chronological.
    const firstDay = Math.min(producedDaysAgo - 1, 29);
    const days = Array.from({ length: cutCount }, () => Math.floor(rand() * (firstDay + 1))).sort((a, b) => b - a);

    let left = totalFeet;
    splitFeet(totalFeet - remainingFeet, cutCount).forEach((feetCut, i) => {
      left -= feetCut;
      pending.push({
        bundleId,
        feetCut,
        destinationShop: pickShop(),
        date: isoDaysAgo(days[i]),
        remainingFeetAfterCut: left,
      });
    });
  }

  // Number cuts in date order (stable sort keeps same-day cuts on one bundle in sequence).
  const cuts = pending
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c, i) => ({ cutId: `CUT-${String(i + 1).padStart(4, '0')}`, ...c }));

  return { bundles, cuts };
}

const generated = generate();

export const INITIAL_BUNDLES: Bundle[] = generated.bundles;
export const INITIAL_CUTS: CutRecord[] = generated.cuts;
