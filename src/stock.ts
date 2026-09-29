import type { Bundle } from './mockData';

/** A bundle counts as low stock below this share of its original length. */
export const LOW_STOCK_RATIO = 0.15;

export type StockLevel = 'ok' | 'low' | 'depleted';

export function stockLevel(bundle: Bundle): StockLevel {
  if (bundle.remainingFeet <= 0) return 'depleted';
  if (bundle.remainingFeet < bundle.totalFeet * LOW_STOCK_RATIO) return 'low';
  return 'ok';
}
