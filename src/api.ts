/*
  Every database call the app makes. Reads go through RLS (row-level
  security) or Inventory's read functions; every write goes through an
  Inventory entry function, which checks permissions in the database.
*/
import { errorMessage, supabase } from './lib/supabase';

const inv = () => supabase.schema('inventory');

export type Category = 'copper' | 'pvc' | 'finished_cable' | 'consumable';
export type BaseUnit = 'kg' | 'ft' | 'pcs' | 'm';

export interface UnitOption {
  unit: string;
  factor_to_base: number;
}

export interface Item {
  item_id: string;
  code: string | null;
  name: string;
  category: Category;
  base_unit: BaseUnit;
  units: UnitOption[];
  active: boolean;
}

export interface Location {
  location_id: string;
  name: string;
  code: string | null;
  type: 'shop' | 'factory' | 'warehouse';
  business_id: string;
}

export interface LocationRow extends Location {
  active: boolean;
}

export interface Availability {
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  quantity: number;
  unit: string;
}

export interface Balance {
  item_id: string;
  location_id: string;
  on_hand: number;
  reorder_level: number | null;
}

export interface Bobbin {
  bobbin_id: string;
  bobbin_no: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  remaining_ft: number;
  original_ft: number;
  opened: boolean;
  production_order_id: string | null;
  parent_bobbin_id: string | null;
  created_at: string;
}

export interface BobbinRecord {
  id: string;
  bobbin_no: string;
  item_id: string;
  location_id: string;
  production_order_id: string | null;
  source_type: string;
  source_id: string | null;
  parent_bobbin_id: string | null;
  original_ft: number;
  remaining_ft: number;
  cost_status: 'pending' | 'final';
  created_at: string;
}

export interface BobbinHistoryRow {
  movement_id: string;
  bobbin_id: string;
  bobbin_no: string;
  movement_date: string;
  movement_type: string;
  quantity: number;
  location_id: string;
  location_name: string;
  source_type: string;
  source_id: string | null;
  reverses_movement_id: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
}

export interface Movement {
  id: string;
  item_id: string;
  location_id: string;
  movement_date: string;
  movement_type: string;
  quantity: number;
  source_type: string;
  source_id: string | null;
  reverses_movement_id: string | null;
  transfer_id: string | null;
  bobbin_id: string | null;
  reason: string | null;
  note: string | null;
  balance_after: number;
  created_at: string;
}

export interface SpecOption {
  id: string;
  spec_type: SpecType;
  value: string;
  sort_order: number;
  active: boolean;
}

export type SpecType = 'wires' | 'thou' | 'cores' | 'mm2' | 'cable_type' | 'pvc_colour' | 'pvc_grade';

export interface CableSpecs {
  item_id: string;
  wires_option_id: string | null;
  thou_option_id: string | null;
  cores_option_id: string | null;
  mm2_option_id: string | null;
  type_option_id: string | null;
}
export interface PvcSpecs {
  item_id: string;
  colour_option_id: string | null;
  grade_option_id: string | null;
}
export interface CopperSpecs {
  item_id: string;
  form: 'rod' | 'wire' | null;
  thou_option_id: string | null;
}

export interface ItemCost {
  item_id: string;
  avg_unit_cost: number;
  standard_cost: number | null;
}

export interface Settings {
  large_adjustment_threshold_kg: number;
  large_adjustment_threshold_ft: number;
  large_adjustment_threshold_pcs: number;
  large_adjustment_threshold_m: number;
  large_adjustment_window_days: number;
}

export interface ValuationRow {
  item_id: string;
  item_name: string;
  category: Category;
  location_id: string;
  location_name: string;
  quantity: number;
  unit: string;
  avg_unit_cost: number;
  value: number;
  pending_ft: number;
}

export interface TrendRow {
  bucket_start: string;
  item_id: string;
  item_name: string;
  category: Category;
  unit: string;
  quantity: number;
}

export interface Business {
  id: string;
  legal_name: string;
  trading_name: string | null;
  active: boolean;
}

export interface StaffProfile {
  user_id: string;
  full_name: string;
  username: string | null;
  role: 'owner' | 'employee';
  active: boolean;
}

/** Throws a readable Error when Supabase returns one. */
function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(errorMessage(res.error));
  return res.data as T;
}

/* Numeric columns can arrive as strings for large values; normalise. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------- catalog

export async function listItems(includeInactive = true): Promise<Item[]> {
  const rows = unwrap(await inv().rpc('list_items', { p_include_inactive: includeInactive })) as Item[];
  return rows.map((r) => ({ ...r, units: (r.units ?? []).map((u) => ({ ...u, factor_to_base: num(u.factor_to_base) })) }));
}

export async function listLocations(): Promise<Location[]> {
  return unwrap(await inv().rpc('list_locations')) as Location[];
}

/** All locations including inactive (needs Inventory module access). */
export async function listAllLocations(): Promise<LocationRow[]> {
  const rows = unwrap(
    await inv().from('locations').select('id, name, code, type, business_id, active').order('name'),
  ) as { id: string; name: string; code: string | null; type: Location['type']; business_id: string; active: boolean }[];
  return rows.map((r) => ({ location_id: r.id, name: r.name, code: r.code, type: r.type, business_id: r.business_id, active: r.active }));
}

export async function myStockLocations(userId: string): Promise<string[]> {
  const rows = unwrap(await inv().from('user_locations').select('location_id').eq('user_id', userId)) as { location_id: string }[];
  return rows.map((r) => r.location_id);
}

export async function allUserLocations(): Promise<{ user_id: string; location_id: string }[]> {
  return unwrap(await inv().from('user_locations').select('user_id, location_id')) as { user_id: string; location_id: string }[];
}

// ---------------------------------------------------------------- stock

export async function stockAvailability(itemIds?: string[]): Promise<Availability[]> {
  const rows = unwrap(await inv().rpc('get_stock_availability', { p_item_ids: itemIds ?? null })) as Availability[];
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}

export async function balances(itemId?: string): Promise<Balance[]> {
  let q = inv().from('stock_balances').select('item_id, location_id, on_hand, reorder_level');
  if (itemId) q = q.eq('item_id', itemId);
  const rows = unwrap(await q) as Balance[];
  return rows.map((r) => ({ ...r, on_hand: num(r.on_hand), reorder_level: numOrNull(r.reorder_level) }));
}

export async function listBobbins(itemId?: string | null, locationId?: string | null, includeEmpty = false): Promise<Bobbin[]> {
  const rows = unwrap(
    await inv().rpc('list_bobbins', {
      p_item_id: itemId ?? null,
      p_location_id: locationId ?? null,
      p_include_empty: includeEmpty,
    }),
  ) as Bobbin[];
  return rows.map((r) => ({ ...r, remaining_ft: num(r.remaining_ft), original_ft: num(r.original_ft) }));
}

const BOBBIN_COLUMNS =
  'id, bobbin_no, item_id, location_id, production_order_id, source_type, source_id, parent_bobbin_id, original_ft, remaining_ft, cost_status, created_at';

export async function getBobbin(id: string): Promise<BobbinRecord | null> {
  const row = unwrap(await inv().from('bobbins').select(BOBBIN_COLUMNS).eq('id', id).maybeSingle()) as BobbinRecord | null;
  return row && { ...row, original_ft: num(row.original_ft), remaining_ft: num(row.remaining_ft) };
}

export async function bobbinChildren(id: string): Promise<BobbinRecord[]> {
  const rows = unwrap(await inv().from('bobbins').select(BOBBIN_COLUMNS).eq('parent_bobbin_id', id).order('bobbin_no')) as BobbinRecord[];
  return rows.map((r) => ({ ...r, original_ft: num(r.original_ft), remaining_ft: num(r.remaining_ft) }));
}

export async function bobbinNumbers(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = unwrap(await inv().from('bobbins').select('id, bobbin_no').in('id', ids)) as { id: string; bobbin_no: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, r.bobbin_no]));
}

export async function bobbinHistory(id: string): Promise<BobbinHistoryRow[]> {
  const rows = unwrap(await inv().rpc('bobbin_history', { p_bobbin_id: id })) as BobbinHistoryRow[];
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}

// unit_cost is not granted to browsers, so the columns are always named.
const MOVEMENT_COLUMNS =
  'id, item_id, location_id, movement_date, movement_type, quantity, source_type, source_id, reverses_movement_id, transfer_id, bobbin_id, reason, note, balance_after, created_at';

export interface MovementFilter {
  id?: string;
  itemId?: string;
  locationId?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listMovements(f: MovementFilter): Promise<Movement[]> {
  let q = inv().from('stock_movements').select(MOVEMENT_COLUMNS);
  if (f.id) q = q.eq('id', f.id);
  if (f.itemId) q = q.eq('item_id', f.itemId);
  if (f.locationId) q = q.eq('location_id', f.locationId);
  if (f.type) q = q.eq('movement_type', f.type);
  if (f.from) q = q.gte('movement_date', f.from);
  if (f.to) q = q.lte('movement_date', f.to);
  const rows = unwrap(
    await q.order('movement_date', { ascending: false }).order('created_at', { ascending: false }).limit(f.limit ?? 300),
  ) as Movement[];
  return rows.map((r) => ({ ...r, quantity: num(r.quantity), balance_after: num(r.balance_after) }));
}

/** Ids among `ids` that already have a reversal. */
export async function reversedIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = unwrap(
    await inv().from('stock_movements').select('reverses_movement_id').in('reverses_movement_id', ids),
  ) as { reverses_movement_id: string }[];
  return new Set(rows.map((r) => r.reverses_movement_id));
}

// ---------------------------------------------------------------- items and specs

export async function listSpecOptions(): Promise<SpecOption[]> {
  return unwrap(
    await inv().from('spec_options').select('id, spec_type, value, sort_order, active').order('sort_order').order('value'),
  ) as SpecOption[];
}

export async function getItemSpecs(itemId: string): Promise<{
  cable: CableSpecs | null;
  pvc: PvcSpecs | null;
  copper: CopperSpecs | null;
}> {
  const [cable, pvc, copper] = await Promise.all([
    inv().from('cable_specs').select('item_id, wires_option_id, thou_option_id, cores_option_id, mm2_option_id, type_option_id').eq('item_id', itemId).maybeSingle(),
    inv().from('pvc_specs').select('item_id, colour_option_id, grade_option_id').eq('item_id', itemId).maybeSingle(),
    inv().from('copper_specs').select('item_id, form, thou_option_id').eq('item_id', itemId).maybeSingle(),
  ]);
  return {
    cable: unwrap(cable) as CableSpecs | null,
    pvc: unwrap(pvc) as PvcSpecs | null,
    copper: unwrap(copper) as CopperSpecs | null,
  };
}

/** Item costs; returns [] without view_costs (RLS). */
export async function itemCosts(itemIds?: string[]): Promise<ItemCost[]> {
  let q = inv().from('item_costs').select('item_id, avg_unit_cost, standard_cost');
  if (itemIds) q = q.in('item_id', itemIds);
  const rows = unwrap(await q) as ItemCost[];
  return rows.map((r) => ({ ...r, avg_unit_cost: num(r.avg_unit_cost), standard_cost: numOrNull(r.standard_cost) }));
}

export async function saveItem(item: Record<string, unknown>, specs: Record<string, unknown> | null): Promise<string> {
  return unwrap(await inv().rpc('save_item', { p_item: item, p_specs: specs })) as string;
}

export async function setItemActive(itemId: string, active: boolean): Promise<void> {
  unwrap(await inv().rpc('set_item_active', { p_item_id: itemId, p_active: active }));
}

export async function saveItemUnit(itemId: string, unitName: string, factor: number, active = true): Promise<string> {
  return unwrap(
    await inv().rpc('save_item_unit', { p_item_id: itemId, p_unit_name: unitName, p_factor_to_base: factor, p_active: active }),
  ) as string;
}

/** Item units including inactive ones (list_items only returns active). */
export async function itemUnits(itemId: string): Promise<{ id: string; unit_name: string; factor_to_base: number; active: boolean }[]> {
  const rows = unwrap(
    await inv().from('item_units').select('id, unit_name, factor_to_base, active').eq('item_id', itemId).order('factor_to_base'),
  ) as { id: string; unit_name: string; factor_to_base: number; active: boolean }[];
  return rows.map((r) => ({ ...r, factor_to_base: num(r.factor_to_base) }));
}

export async function saveSpecOption(o: { id: string | null; spec_type: SpecType; value: string; sort_order: number; active: boolean }): Promise<string> {
  return unwrap(
    await inv().rpc('save_spec_option', {
      p_option_id: o.id,
      p_spec_type: o.spec_type,
      p_value: o.value,
      p_sort_order: o.sort_order,
      p_active: o.active,
    }),
  ) as string;
}

export async function setStandardCost(itemId: string, cost: number | null): Promise<void> {
  unwrap(await inv().rpc('set_standard_cost', { p_item_id: itemId, p_cost: cost }));
}

export async function setReorderLevel(itemId: string, locationId: string, level: number | null): Promise<void> {
  unwrap(await inv().rpc('set_reorder_level', { p_item_id: itemId, p_location_id: locationId, p_level: level }));
}

// ---------------------------------------------------------------- stock entries

export async function adjustStock(a: {
  itemId: string;
  locationId: string;
  quantity: number;
  reason: string;
  note: string | null;
  bobbinId: string | null;
  date: string | null;
}): Promise<string> {
  return unwrap(
    await inv().rpc('adjust_stock', {
      p_item_id: a.itemId,
      p_location_id: a.locationId,
      p_quantity: a.quantity,
      p_reason: a.reason,
      p_note: a.note,
      p_bobbin_id: a.bobbinId,
      p_movement_date: a.date,
    }),
  ) as string;
}

export async function recordTransfer(t: {
  itemId: string;
  fromId: string;
  toId: string;
  quantity: number | null;
  note: string | null;
  bobbinId: string | null;
  date: string | null;
}): Promise<string> {
  return unwrap(
    await inv().rpc('record_transfer', {
      p_item_id: t.itemId,
      p_from_location_id: t.fromId,
      p_to_location_id: t.toId,
      p_quantity: t.quantity,
      p_note: t.note,
      p_bobbin_id: t.bobbinId,
      p_movement_date: t.date,
    }),
  ) as string;
}

export async function requestReversal(movementId: string, reason: string): Promise<string> {
  return unwrap(await inv().rpc('request_reversal', { p_movement_id: movementId, p_reason: reason })) as string;
}

export async function recordOpening(o: {
  itemId: string;
  locationId: string;
  quantity: number | null;
  unitCost: number | null;
  date: string | null;
  note: string | null;
  bobbins: { length_ft: number }[] | null;
}): Promise<{ movement_id: string; bobbin_id: string | null; bobbin_no: string | null }[]> {
  return unwrap(
    await inv().rpc('record_opening_balance', {
      p_item_id: o.itemId,
      p_location_id: o.locationId,
      p_quantity: o.quantity,
      p_unit_cost: o.unitCost,
      p_date: o.date,
      p_note: o.note,
      p_bobbins: o.bobbins,
    }),
  ) as { movement_id: string; bobbin_id: string | null; bobbin_no: string | null }[];
}

// ---------------------------------------------------------------- reports

export async function consumptionTrend(from: string, to: string, bucket: 'day' | 'week' | 'month', locationId: string | null): Promise<TrendRow[]> {
  const rows = unwrap(
    await inv().rpc('consumption_trend', { p_from: from, p_to: to, p_bucket: bucket, p_location_id: locationId }),
  ) as TrendRow[];
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}

export async function stockValuation(): Promise<ValuationRow[]> {
  const rows = unwrap(await inv().rpc('stock_valuation')) as ValuationRow[];
  return rows.map((r) => ({
    ...r,
    quantity: num(r.quantity),
    avg_unit_cost: num(r.avg_unit_cost),
    value: num(r.value),
    pending_ft: num(r.pending_ft),
  }));
}

// ---------------------------------------------------------------- locations, access, settings

export async function listBusinesses(): Promise<Business[]> {
  return unwrap(
    await supabase.schema('portal').from('businesses').select('id, legal_name, trading_name, active').order('legal_name'),
  ) as Business[];
}

export async function saveLocation(l: {
  id: string | null;
  name: string;
  code: string | null;
  type: string;
  businessId: string;
  active: boolean;
}): Promise<string> {
  return unwrap(
    await inv().rpc('save_location', {
      p_location_id: l.id,
      p_name: l.name,
      p_code: l.code,
      p_type: l.type,
      p_business_id: l.businessId,
      p_active: l.active,
    }),
  ) as string;
}

export async function listStaff(): Promise<StaffProfile[]> {
  return unwrap(
    await supabase.schema('portal').from('profiles').select('user_id, full_name, username, role, active').order('full_name'),
  ) as StaffProfile[];
}

export async function setUserLocations(userId: string, locationIds: string[]): Promise<void> {
  unwrap(await inv().rpc('set_user_locations', { p_user_id: userId, p_location_ids: locationIds }));
}

export async function getSettings(): Promise<Settings | null> {
  const row = unwrap(
    await inv()
      .from('settings')
      .select('large_adjustment_threshold_kg, large_adjustment_threshold_ft, large_adjustment_threshold_pcs, large_adjustment_threshold_m, large_adjustment_window_days')
      .maybeSingle(),
  ) as Settings | null;
  if (!row) return null;
  return {
    large_adjustment_threshold_kg: num(row.large_adjustment_threshold_kg),
    large_adjustment_threshold_ft: num(row.large_adjustment_threshold_ft),
    large_adjustment_threshold_pcs: num(row.large_adjustment_threshold_pcs),
    large_adjustment_threshold_m: num(row.large_adjustment_threshold_m),
    large_adjustment_window_days: num(row.large_adjustment_window_days),
  };
}

export async function updateSettings(s: Settings): Promise<void> {
  unwrap(await inv().rpc('update_settings', { p_settings: s }));
}
