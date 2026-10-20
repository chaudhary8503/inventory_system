const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const costFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** "1,250.5 ft" */
export function formatQty(amount: number | null | undefined, unit?: string): string {
  if (amount === null || amount === undefined) return '—';
  return unit ? `${qtyFmt.format(amount)} ${unit}` : qtyFmt.format(amount);
}

/** "Rs 45,000" */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `Rs ${moneyFmt.format(amount)}`;
}

/** Cost per unit, e.g. "Rs 52.50 / ft" */
export function formatUnitCost(amount: number | null | undefined, unit?: string): string {
  if (amount === null || amount === undefined) return 'Pending';
  return `Rs ${costFmt.format(amount)}${unit ? ` / ${unit}` : ''}`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Karachi',
});

/** "2026-09-28" -> "28 Sep 2026" (parsed as a calendar date, not UTC). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

/** Timestamp in Karachi time, e.g. "20 Oct, 14:05". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateTimeFmt.format(new Date(iso));
}

/** Today's business date (Asia/Karachi) as YYYY-MM-DD. */
export function todayKarachi(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

/** YYYY-MM-DD n days before today (Karachi). */
export function daysAgo(n: number): string {
  const [y, m, d] = todayKarachi().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - n));
  return date.toISOString().slice(0, 10);
}

export const CATEGORY_LABELS: Record<string, string> = {
  copper: 'Copper',
  pvc: 'PVC',
  finished_cable: 'Cable',
  consumable: 'Consumable',
};

export const MOVEMENT_LABELS: Record<string, string> = {
  opening_balance: 'Opening stock',
  purchase_receipt: 'Purchase',
  supplier_return: 'Returned to supplier',
  production_consumption: 'Used in production',
  production_output: 'Produced',
  sale: 'Sale',
  sale_return: 'Customer return',
  adjustment: 'Adjustment',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  reversal: 'Reversal',
};

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  factory: 'Factory',
  shop: 'Shop',
  warehouse: 'Warehouse',
};

/** Signed quantity with an explicit "+" for stock in. */
export function formatSigned(amount: number, unit?: string): string {
  return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatQty(Math.abs(amount), unit)}`;
}
