import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletableTable, type DeletionMetadata } from "./adminDeletionService";

export type InventoryItemRow = DeletionMetadata & {
  id: string;
  name: string;
  category: string;
  category_id: string | null;
  unit_id: string | null;
  presentation_unit_id: string | null;
  supplier_id: string | null;
  sku: string | null;
  barcode: string | null;
  item_type: string;
  unit: string;
  city: string | null;
  current_stock: number;
  minimum_stock: number;
  units_per_presentation: number;
  reference_cost: number | null;
  sale_price: number | null;
  lot_number: string | null;
  expiration_date: string | null;
  alert_days_before_expiration: number;
  notes: string | null;
  location_id: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryCategoryRow = DeletionMetadata & {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryUnitRow = DeletionMetadata & {
  id: string;
  name: string;
  abbreviation: string;
  unit_type: "unidad" | "peso" | "volumen" | "empaque";
  is_base_unit: boolean;
  base_unit_id: string | null;
  conversion_factor: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventorySupplierRow = DeletionMetadata & {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms_days: number;
  allows_consignment: boolean;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryLocationRow = DeletionMetadata & {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryAdjustmentRow = DeletionMetadata & {
  id: string;
  item_id: string;
  item_name_snapshot: string;
  category_snapshot: string | null;
  adjustment_type: "conteo_nocturno" | "compra" | "merma" | "vencido" | "correccion";
  previous_stock: number;
  new_stock: number;
  difference_stock: number;
  reason: string | null;
  location_name_snapshot: string | null;
  counted_at: string;
  created_by: string | null;
  created_at: string;
};

export type InventoryLotRow = DeletionMetadata & {
  id: string;
  item_id: string;
  lot_number: string;
  supplier_id: string | null;
  location_id: string | null;
  presentation_unit_id: string | null;
  received_date: string | null;
  expiration_date: string | null;
  initial_quantity: number;
  current_quantity: number;
  units_per_presentation: number;
  unit_cost: number | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMovementRow = DeletionMetadata & {
  id: string;
  item_id: string;
  lot_id: string | null;
  movement_type: "entrada" | "salida" | "merma" | "transferencia" | "ajuste" | "conteo";
  quantity: number;
  unit_cost: number | null;
  from_location_id: string | null;
  to_location_id: string | null;
  supplier_id: string | null;
  reference: string | null;
  reason: string | null;
  movement_date: string;
  item_name_snapshot: string;
  lot_number_snapshot: string | null;
  from_location_snapshot: string | null;
  to_location_snapshot: string | null;
  supplier_name_snapshot: string | null;
  created_by: string | null;
  created_at: string;
};

export type InventoryCountRow = DeletionMetadata & {
  id: string;
  count_date: string;
  location_id: string | null;
  status: "abierto" | "cerrado";
  shift_name: string | null;
  notes: string | null;
  created_by: string | null;
  opened_by: string | null;
  opened_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryCountLineRow = {
  id: string;
  count_id: string;
  item_id: string;
  opening_stock: number;
  expected_stock: number;
  counted_stock: number;
  difference_stock: number;
  notes: string | null;
  counted_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getInventoryItems(includeDeleted = false) {
  let query = supabase.from("inventory_items").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("inventory_items", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryItemRow[];
}

export async function getInventoryLocations(includeDeleted = false) {
  let query = supabase.from("inventory_locations").select("*").order("name", { ascending: true });
  const filter = getVisibleDeletionFilter("inventory_locations", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryLocationRow[];
}

async function listTable<T>(table: string, includeDeleted: boolean, orderColumn = "created_at", ascending = false) {
  let query = supabase.from(table).select("*").order(orderColumn, { ascending });
  const filter = getVisibleDeletionFilter(table as DeletableTable, includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

async function createRow<T>(table: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from(table).insert(data).select("*").single();
  if (error) throw error;
  return row as T;
}

async function updateRow<T>(table: string, id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from(table).update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as T;
}

export function getInventoryCategories(includeDeleted = false) {
  return listTable<InventoryCategoryRow>("inventory_categories", includeDeleted, "name", true);
}

export function createInventoryCategory(data: Record<string, unknown>) {
  return createRow<InventoryCategoryRow>("inventory_categories", data);
}

export function updateInventoryCategory(id: string, data: Record<string, unknown>) {
  return updateRow<InventoryCategoryRow>("inventory_categories", id, data);
}

export function getInventoryUnits(includeDeleted = false) {
  return listTable<InventoryUnitRow>("inventory_units", includeDeleted, "name", true);
}

export function createInventoryUnit(data: Record<string, unknown>) {
  return createRow<InventoryUnitRow>("inventory_units", data);
}

export function updateInventoryUnit(id: string, data: Record<string, unknown>) {
  return updateRow<InventoryUnitRow>("inventory_units", id, data);
}

export function getInventorySuppliers(includeDeleted = false) {
  return listTable<InventorySupplierRow>("inventory_suppliers", includeDeleted, "name", true);
}

export function createInventorySupplier(data: Record<string, unknown>) {
  return createRow<InventorySupplierRow>("inventory_suppliers", data);
}

export function updateInventorySupplier(id: string, data: Record<string, unknown>) {
  return updateRow<InventorySupplierRow>("inventory_suppliers", id, data);
}

export function getInventoryLots(includeDeleted = false) {
  return listTable<InventoryLotRow>("inventory_lots", includeDeleted, "created_at", false);
}

export function createInventoryLot(data: Record<string, unknown>) {
  return createRow<InventoryLotRow>("inventory_lots", data);
}

export function updateInventoryLot(id: string, data: Record<string, unknown>) {
  return updateRow<InventoryLotRow>("inventory_lots", id, data);
}

export function getInventoryMovements(includeDeleted = false) {
  return listTable<InventoryMovementRow>("inventory_movements", includeDeleted, "movement_date", false);
}

export function getInventoryCounts(includeDeleted = false) {
  return listTable<InventoryCountRow>("inventory_counts", includeDeleted, "count_date", false);
}

export function getInventoryCountLines() {
  return supabase
    .from("inventory_count_lines")
    .select("*")
    .order("created_at", { ascending: true })
    .then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as InventoryCountLineRow[];
    });
}

export async function createInventoryLocation(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("inventory_locations").insert(data).select("*").single();
  if (error) throw error;
  return row as InventoryLocationRow;
}

export async function updateInventoryLocation(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("inventory_locations").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as InventoryLocationRow;
}

export async function createInventoryItem(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("inventory_items").insert(data).select("*").single();
  if (error) throw error;
  return row as InventoryItemRow;
}

export async function updateInventoryItem(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("inventory_items").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as InventoryItemRow;
}

export async function getInventoryAdjustments(includeDeleted = false) {
  let query = supabase.from("inventory_adjustments").select("*").order("counted_at", { ascending: false });
  const filter = getVisibleDeletionFilter("inventory_adjustments", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryAdjustmentRow[];
}

export async function applyInventoryAdjustment(data: {
  itemId: string;
  adjustmentType: InventoryAdjustmentRow["adjustment_type"];
  newStock: number;
  reason?: string | null;
  countedAt?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("apply_inventory_adjustment", {
    p_item_id: data.itemId,
    p_adjustment_type: data.adjustmentType,
    p_new_stock: data.newStock,
    p_reason: data.reason ?? null,
    p_counted_at: data.countedAt ?? null,
  });
  if (error) throw error;
  return row as InventoryAdjustmentRow;
}

export async function recordInventoryMovement(data: {
  itemId: string;
  movementType: InventoryMovementRow["movement_type"];
  quantity: number;
  lotId?: string | null;
  unitCost?: number | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  supplierId?: string | null;
  reference?: string | null;
  reason?: string | null;
  movementDate?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("record_inventory_movement", {
    p_item_id: data.itemId,
    p_movement_type: data.movementType,
    p_quantity: data.quantity,
    p_lot_id: data.lotId ?? null,
    p_unit_cost: data.unitCost ?? null,
    p_from_location_id: data.fromLocationId ?? null,
    p_to_location_id: data.toLocationId ?? null,
    p_supplier_id: data.supplierId ?? null,
    p_reference: data.reference ?? null,
    p_reason: data.reason ?? null,
    p_movement_date: data.movementDate ?? null,
  });
  if (error) throw error;
  return row as InventoryMovementRow;
}

export async function recordInventoryCountLine(data: {
  itemId: string;
  countedStock: number;
  locationId?: string | null;
  notes?: string | null;
  countDate?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("record_inventory_count_line", {
    p_item_id: data.itemId,
    p_counted_stock: data.countedStock,
    p_location_id: data.locationId ?? null,
    p_notes: data.notes ?? null,
    p_count_date: data.countDate ?? null,
  });
  if (error) throw error;
  return row;
}

export async function openInventoryShift(data: {
  locationId?: string | null;
  shiftName?: string | null;
  notes?: string | null;
  countDate?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("open_inventory_shift", {
    p_location_id: data.locationId ?? null,
    p_shift_name: data.shiftName ?? null,
    p_notes: data.notes ?? null,
    p_count_date: data.countDate ?? null,
  });
  if (error) throw error;
  return row as InventoryCountRow;
}

export async function updateInventoryShiftLine(data: {
  countId: string;
  itemId: string;
  countedStock: number;
  notes?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("update_inventory_shift_line", {
    p_count_id: data.countId,
    p_item_id: data.itemId,
    p_counted_stock: data.countedStock,
    p_notes: data.notes ?? null,
  });
  if (error) throw error;
  return row as InventoryCountLineRow;
}

export async function closeInventoryShift(data: { countId: string; notes?: string | null }) {
  const { data: row, error } = await supabase.rpc("close_inventory_shift", {
    p_count_id: data.countId,
    p_notes: data.notes ?? null,
  });
  if (error) throw error;
  return row as InventoryCountRow;
}
