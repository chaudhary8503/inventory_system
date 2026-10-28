/*
  Every database call the app makes. Reads go through RLS (row-level
  security) or Inventory's read functions; every write goes through an
  Inventory entry function, which checks permissions in the database.
*/
import { errorMessage, supabase } from './lib/supabase';

const inv = () => supabase.schema('inventory');

export type Category = 'copper' | 'pvc' | 'semi_finished' | 'finished_cable' | 'consumable' | 'scrap' | 'other';
export type BaseUnit = 'kg' | 'ft' | 'pcs' | 'm' | 'roll';

export interface UnitOption {
  unit: string;
  factor_to_base: number;
}

export interface ItemSpecValues {
  material?: string;
  size_mm2?: string;
  cores?: string;
  flex_standard?: string;
  cable_type?: string;
  double_pvc?: boolean;
  wires?: string;
  thou?: string;
  copper_grade?: string;
  form?: string;
  pvc_colour?: string;
  pvc_grade?: string;
}

export interface Item {
  item_id: string;
  code: string | null;
  name: string;
  invoice_name: string | null;
  category: Category;
  base_unit: BaseUnit;
  units: UnitOption[];
  specs: ItemSpecValues;
  source: 'made' | 'bought' | 'both' | null;
  standard_cost_set: boolean;
  manager_key: string | null;
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

export interface Bundle {
  bundle_id: string;
  bundle_no: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  remaining_ft: number;
  original_ft: number;
  opened: boolean;
  production_order_id: string | null;
  parent_bundle_id: string | null;
  created_at: string;
}

export interface BundleRecord {
  id: string;
  bundle_no: string;
  item_id: string;
  location_id: string;
  production_order_id: string | null;
  source_type: string;
  source_id: string | null;
  parent_bundle_id: string | null;
  original_ft: number;
  remaining_ft: number;
  cost_status: 'pending' | 'final';
  created_at: string;
}

export interface BundleHistoryRow {
  movement_id: string;
  bundle_id: string;
  bundle_no: string;
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
  bundle_id: string | null;
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

export type SpecType = 'material' | 'mm2' | 'cores' | 'flex_standard' | 'cable_type' | 'wires' | 'thou' | 'copper_grade' | 'pvc_colour' | 'pvc_grade';

export interface CableSpecs {
  item_id: string;
  material_option_id: string | null;
  mm2_option_id: string | null;
  cores_option_id: string | null;
  flex_option_id: string | null;
  cable_type_option_id: string | null;
  double_pvc: boolean;
  wires_option_id: string | null;
  thou_option_id: string | null;
}
export interface PvcSpecs {
  item_id: string;
  colour_option_id: string | null;
  grade_option_id: string | null;
}
export interface CopperSpecs {
  item_id: string;
  form: 'rod' | 'wire' | null;
  grade_option_id: string | null;
  thou_option_id: string | null;
}

export interface ItemDetails {
  description: string | null;
  invoice_name_custom: boolean;
  name_custom: boolean;
  manager_name: string | null;
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
  adjustment_reasons: string[];
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
  /** Empty string (never null) when the Portal leaves it blank. */
  trading_name: string;
  active: boolean;
}

/** Name to show for a business: its trading name, or the legal name when that's blank. */
export function businessLabel(b: { legal_name: string; trading_name?: string | null }): string {
  return b.trading_name?.trim() || b.legal_name;
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

export async function listBundles(itemId?: string | null, locationId?: string | null, includeEmpty = false): Promise<Bundle[]> {
  const rows = unwrap(
    await inv().rpc('list_bundles', {
      p_item_id: itemId ?? null,
      p_location_id: locationId ?? null,
      p_include_empty: includeEmpty,
    }),
  ) as Bundle[];
  return rows.map((r) => ({ ...r, remaining_ft: num(r.remaining_ft), original_ft: num(r.original_ft) }));
}

const BUNDLE_COLUMNS =
  'id, bundle_no, item_id, location_id, production_order_id, source_type, source_id, parent_bundle_id, original_ft, remaining_ft, cost_status, created_at';

export async function getBundle(id: string): Promise<BundleRecord | null> {
  const row = unwrap(await inv().from('bundles').select(BUNDLE_COLUMNS).eq('id', id).maybeSingle()) as BundleRecord | null;
  return row && { ...row, original_ft: num(row.original_ft), remaining_ft: num(row.remaining_ft) };
}

export async function bundleChildren(id: string): Promise<BundleRecord[]> {
  const rows = unwrap(await inv().from('bundles').select(BUNDLE_COLUMNS).eq('parent_bundle_id', id).order('bundle_no')) as BundleRecord[];
  return rows.map((r) => ({ ...r, original_ft: num(r.original_ft), remaining_ft: num(r.remaining_ft) }));
}

export async function bundleNumbers(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = unwrap(await inv().from('bundles').select('id, bundle_no').in('id', ids)) as { id: string; bundle_no: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, r.bundle_no]));
}

export async function bundleHistory(id: string): Promise<BundleHistoryRow[]> {
  const rows = unwrap(await inv().rpc('bundle_history', { p_bundle_id: id })) as BundleHistoryRow[];
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}

// unit_cost is not granted to browsers, so the columns are always named.
const MOVEMENT_COLUMNS =
  'id, item_id, location_id, movement_date, movement_type, quantity, source_type, source_id, reverses_movement_id, transfer_id, bundle_id, reason, note, balance_after, created_at';

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
    inv().from('cable_specs').select('item_id, material_option_id, mm2_option_id, cores_option_id, flex_option_id, cable_type_option_id, double_pvc, wires_option_id, thou_option_id').eq('item_id', itemId).maybeSingle(),
    inv().from('pvc_specs').select('item_id, colour_option_id, grade_option_id').eq('item_id', itemId).maybeSingle(),
    inv().from('copper_specs').select('item_id, form, grade_option_id, thou_option_id').eq('item_id', itemId).maybeSingle(),
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
  bundleId: string | null;
  date: string | null;
}): Promise<string> {
  return unwrap(
    await inv().rpc('adjust_stock', {
      p_item_id: a.itemId,
      p_location_id: a.locationId,
      p_quantity: a.quantity,
      p_reason: a.reason,
      p_note: a.note,
      p_bundle_id: a.bundleId,
      p_movement_date: a.date,
    }),
  ) as string;
}

export interface TransferLine {
  item_id: string;
  /** Base units (feet for cable); null with a bundle = the whole bundle. */
  quantity: number | null;
  bundle_id?: string | null;
  note?: string | null;
}

/** One delivery challan with one or more lines. Returns the challan (document) id. */
export async function recordTransferDocument(t: {
  fromId: string;
  toId: string;
  lines: TransferLine[];
  vehicleNo: string | null;
  driverName: string | null;
  note: string | null;
  date: string | null;
}): Promise<string> {
  return unwrap(
    await inv().rpc('record_transfer_document', {
      p_from_location_id: t.fromId,
      p_to_location_id: t.toId,
      p_lines: t.lines,
      p_vehicle_no: t.vehicleNo,
      p_driver_name: t.driverName,
      p_note: t.note,
      p_movement_date: t.date,
    }),
  ) as string;
}

export interface ChallanLine {
  item_id: string;
  name: string;
  invoice_name: string;
  base_unit: string;
  quantity: number;
  coil_ft: number | null;
  from_bundle: string | null;
  to_bundle: string | null;
  reversed: boolean;
}

export interface Challan {
  id: string;
  challan_no: string;
  date: string;
  vehicle_no: string | null;
  driver_name: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  from: { id: string; name: string; type: string };
  to: { id: string; name: string; type: string };
  business: { name: string; legal_name: string; address: string | null; phone: string | null; logo_path: string | null } | null;
  cancelled: boolean;
  lines: ChallanLine[];
}

export async function getChallan(id: string): Promise<Challan> {
  const c = unwrap(await inv().rpc('get_challan', { p_document_id: id })) as Challan;
  return {
    ...c,
    lines: (c.lines ?? []).map((l) => ({ ...l, quantity: num(l.quantity), coil_ft: numOrNull(l.coil_ft) })),
  };
}

export interface ChallanRow {
  document_id: string;
  challan_no: string;
  transfer_date: string;
  from_location: string;
  to_location: string;
  line_count: number;
  vehicle_no: string | null;
  cancelled: boolean;
  created_at: string;
}

export async function listChallans(from: string | null, to: string | null, locationId: string | null): Promise<ChallanRow[]> {
  return unwrap(
    await inv().rpc('list_challans', { p_from: from, p_to: to, p_location_id: locationId }),
  ) as ChallanRow[];
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
  bundles: { length_ft: number }[] | null;
  /** Groups several openings (e.g. one spreadsheet import) under one batch id. */
  batchId?: string;
}): Promise<{ movement_id: string; bundle_id: string | null; bundle_no: string | null }[]> {
  return unwrap(
    await inv().rpc('record_opening_balance', {
      p_item_id: o.itemId,
      p_location_id: o.locationId,
      p_quantity: o.quantity,
      p_unit_cost: o.unitCost,
      p_date: o.date,
      p_note: o.note,
      p_bundles: o.bundles,
      p_batch_id: o.batchId ?? null,
    }),
  ) as { movement_id: string; bundle_id: string | null; bundle_no: string | null }[];
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
      .select('large_adjustment_threshold_kg, large_adjustment_threshold_ft, large_adjustment_threshold_pcs, large_adjustment_threshold_m, large_adjustment_window_days, adjustment_reasons')
      .maybeSingle(),
  ) as Settings | null;
  if (!row) return null;
  return {
    large_adjustment_threshold_kg: num(row.large_adjustment_threshold_kg),
    large_adjustment_threshold_ft: num(row.large_adjustment_threshold_ft),
    large_adjustment_threshold_pcs: num(row.large_adjustment_threshold_pcs),
    large_adjustment_threshold_m: num(row.large_adjustment_threshold_m),
    large_adjustment_window_days: num(row.large_adjustment_window_days),
    adjustment_reasons: row.adjustment_reasons ?? [],
  };
}

export async function updateSettings(s: Settings): Promise<void> {
  unwrap(await inv().rpc('update_settings', { p_settings: s }));
}

// ---------------------------------------------------------------- v6: personal setting, item details, import, minimums

/** The person's length unit from the Portal ('ft' or 'm'); feet when the Portal doesn't have it yet. */
export async function getMyLengthUnit(): Promise<'ft' | 'm'> {
  try {
    const res = await supabase.schema('portal').rpc('get_my_settings');
    const unit = (res.data as { length_unit?: string } | null)?.length_unit;
    return unit === 'm' ? 'm' : 'ft';
  } catch {
    return 'ft';
  }
}

export async function getItemDetails(itemId: string): Promise<ItemDetails | null> {
  return unwrap(
    await inv().from('items').select('description, invoice_name_custom, name_custom, manager_name').eq('id', itemId).maybeSingle(),
  ) as ItemDetails | null;
}

export interface ImportPayloadRow {
  manager_key: string;
  manager_name: string;
  category: string;
  base_unit?: string;
  name?: string;
  description?: string;
  source?: string;
  specs?: Record<string, string | boolean>;
  merge_keys?: { manager_key: string; manager_name: string }[];
}

export async function importItems(rows: ImportPayloadRow[], sourceName: string | null): Promise<string> {
  return unwrap(await inv().rpc('import_items', { p_rows: rows, p_source_name: sourceName })) as string;
}

export async function undoItemImport(batchId: string): Promise<number> {
  return num(unwrap(await inv().rpc('undo_item_import', { p_batch_id: batchId })));
}

export interface ImportBatch {
  id: string;
  source_name: string | null;
  item_count: number;
  created_at: string;
  undone_at: string | null;
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  return unwrap(
    await inv().from('item_import_batches').select('id, source_name, item_count, created_at, undone_at').order('created_at', { ascending: false }),
  ) as ImportBatch[];
}

/** Manager.io keys already linked to items (to flag rows that were imported before). */
/** Manager.io key -> Inventory item, for every key linked by an item import (own keys and merged rows). */
export async function managerKeyItems(): Promise<Map<string, string>> {
  const rows = unwrap(await inv().from('item_manager_keys').select('manager_key, item_id')) as { manager_key: string; item_id: string }[];
  return new Map(rows.map((r) => [r.manager_key, r.item_id]));
}

/** Items that already have an opening balance (not reversed) at a location. */
export async function itemsWithOpening(locationId: string): Promise<Set<string>> {
  const rows = unwrap(
    await inv().from('stock_movements').select('id, item_id').eq('location_id', locationId).eq('movement_type', 'opening_balance').limit(5000),
  ) as { id: string; item_id: string }[];
  // In chunks: each id goes into the request URL.
  const reversed = new Set<string>();
  for (let i = 0; i < rows.length; i += 150) {
    for (const id of await reversedIds(rows.slice(i, i + 150).map((r) => r.id))) reversed.add(id);
  }
  return new Set(rows.filter((r) => !reversed.has(r.id)).map((r) => r.item_id));
}

export async function linkedManagerKeys(): Promise<Set<string>> {
  const rows = unwrap(await inv().from('item_manager_keys').select('manager_key')) as { manager_key: string }[];
  return new Set(rows.map((r) => r.manager_key));
}

export interface GroupMinLevel {
  id: string;
  name: string;
  category: Category;
  base_unit: string;
  location_id: string | null;
  filters: Record<string, string | boolean>;
  min_quantity: number;
  active: boolean;
}

export async function listGroupMinLevels(): Promise<GroupMinLevel[]> {
  const rows = unwrap(
    await inv().from('group_min_levels').select('id, name, category, base_unit, location_id, filters, min_quantity, active').order('name'),
  ) as GroupMinLevel[];
  return rows.map((r) => ({ ...r, min_quantity: num(r.min_quantity) }));
}

export async function groupMinLevelTotals(): Promise<Map<string, number>> {
  const rows = unwrap(await inv().rpc('group_min_level_totals')) as { group_id: string; total: number }[];
  return new Map(rows.map((r) => [r.group_id, num(r.total)]));
}

export async function saveGroupMinLevel(g: {
  id: string | null;
  name: string;
  category: string;
  baseUnit: string | null;
  locationId: string | null;
  filters: Record<string, string | boolean>;
  minQuantity: number;
  active: boolean;
}): Promise<string> {
  return unwrap(
    await inv().rpc('save_group_min_level', {
      p_id: g.id,
      p_name: g.name,
      p_category: g.category,
      p_base_unit: g.baseUnit,
      p_location_id: g.locationId,
      p_filters: g.filters,
      p_min_quantity: g.minQuantity,
      p_active: g.active,
    }),
  ) as string;
}
