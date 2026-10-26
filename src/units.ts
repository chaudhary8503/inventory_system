import type { Item, UnitOption } from './api';
import { formatQty, FT_PER_M, getLengthUnit } from './format';

/**
 * Units offered when entering an amount: the base unit, the item's other units
 * (coil, bag...), and metres for anything kept in feet.
 */
export function unitOptions(item: Item | undefined): UnitOption[] {
  if (!item) return [];
  const list = [...item.units];
  if (item.base_unit === 'ft' && !list.some((u) => u.unit === 'm')) list.splice(1, 0, { unit: 'm', factor_to_base: FT_PER_M });
  return list;
}

/** The unit an entry starts in: metres for metre people on feet items, else the base unit. */
export function defaultUnit(item: Item | undefined): string {
  if (!item) return '';
  return item.base_unit === 'ft' && getLengthUnit() === 'm' ? 'm' : item.base_unit;
}

/** Converts an entered amount in `unit` to the item's base unit (3 decimals). */
export function toBase(item: Item | undefined, amount: string, unit: string): number | null {
  if (!item || amount.trim() === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const factor = unitOptions(item).find((u) => u.unit === unit)?.factor_to_base ?? 1;
  return Math.round(value * factor * 1000) / 1000;
}

/** "3 coil = 900 ft" (in the person's unit) when another unit is used, else "". */
export function conversionHint(item: Item | undefined, amount: string, unit: string): string {
  if (!item || unit === defaultUnit(item) || amount.trim() === '') return '';
  const base = toBase(item, amount, unit);
  return base === null ? '' : `${amount} ${unit} = ${formatQty(base, item.base_unit)}`;
}

/** Parses "1000, 800, 1200" or one length per line. */
export function parseLengths(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const values = parts.map(Number);
  return values.every((v) => Number.isFinite(v) && v > 0) ? values : null;
}
