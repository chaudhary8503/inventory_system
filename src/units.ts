import type { Item } from './api';

/** Converts an entered amount in `unit` to the item's base unit (3 decimals). */
export function toBase(item: Item | undefined, amount: string, unit: string): number | null {
  if (!item || amount.trim() === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const factor = item.units.find((u) => u.unit === unit)?.factor_to_base ?? 1;
  return Math.round(value * factor * 1000) / 1000;
}

/** "3 coil = 900 ft" when a non-base unit is used, else "". */
export function conversionHint(item: Item | undefined, amount: string, unit: string): string {
  if (!item || unit === item.base_unit || amount.trim() === '') return '';
  const base = toBase(item, amount, unit);
  return base === null ? '' : `${amount} ${unit} = ${base} ${item.base_unit}`;
}

/** Parses "1000, 800, 1200" or one length per line. */
export function parseLengths(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const values = parts.map(Number);
  return values.every((v) => Number.isFinite(v) && v > 0) ? values : null;
}
