const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const costFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/*
  Feet or metres is a personal setting (contract v6). The database always
  stores feet; set once after login, then every length in feet is shown in the
  person's unit. Rope and other items kept in metres are unaffected.
*/
export type LengthUnit = 'ft' | 'm';
export const M_PER_FT = 0.3048;
export const FT_PER_M = 1 / M_PER_FT;
let lengthUnit: LengthUnit = 'ft';

export function setLengthUnit(u: LengthUnit): void {
  lengthUnit = u;
}
export function getLengthUnit(): LengthUnit {
  return lengthUnit;
}

/** The unit a base unit is shown in ("ft" becomes "m" for metre people). */
export function shownUnit(baseUnit: string | undefined): string | undefined {
  return baseUnit === 'ft' && lengthUnit === 'm' ? 'm' : baseUnit;
}

/** A quantity in base units converted to how it's shown. */
export function shownAmount(amount: number, baseUnit: string | undefined): number {
  return baseUnit === 'ft' && lengthUnit === 'm' ? amount * M_PER_FT : amount;
}

/** "1,250.5 ft" (or "381.15 m" for metre people when the unit is ft). */
export function formatQty(amount: number | null | undefined, unit?: string): string {
  if (amount === null || amount === undefined) return '—';
  const shown = shownAmount(amount, unit);
  const u = shownUnit(unit);
  return u ? `${qtyFmt.format(round3(shown))} ${u}` : qtyFmt.format(shown);
}

/** Number only, converted for the base unit (for table cells under a unit heading). */
export function formatQtyIn(amount: number, baseUnit: string): string {
  return qtyFmt.format(round3(shownAmount(amount, baseUnit)));
}

/** "900 ft (3 coils)" when a coil size is known. */
export function formatWithCoils(amountFt: number, coilFt: number | null | undefined): string {
  const base = formatQty(amountFt, 'ft');
  if (!coilFt || coilFt <= 0) return base;
  const coils = amountFt / coilFt;
  const whole = Math.abs(coils - Math.round(coils)) < 0.001;
  return `${base} (${whole ? Math.round(coils) : qtyFmt.format(Math.round(coils * 100) / 100)} coil${Math.round(coils) === 1 && whole ? '' : 's'})`;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** "Rs 45,000" */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `Rs ${moneyFmt.format(amount)}`;
}

/** Cost per unit, e.g. "Rs 52.50 / ft" (per metre for metre people). */
export function formatUnitCost(amount: number | null | undefined, unit?: string): string {
  if (amount === null || amount === undefined) return 'Pending';
  const perShown = unit === 'ft' && lengthUnit === 'm' ? amount * FT_PER_M : amount;
  return `Rs ${costFmt.format(perShown)}${unit ? ` / ${shownUnit(unit)}` : ''}`;
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
  semi_finished: 'Part-finished',
  finished_cable: 'Cable',
  consumable: 'Consumable',
  scrap: 'Scrap',
  other: 'Other',
};

export const CATEGORY_ORDER = ['copper', 'pvc', 'semi_finished', 'finished_cable', 'consumable', 'scrap', 'other'] as const;

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
