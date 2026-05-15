import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type CashDrawerRow = DeletionMetadata & {
  id: string;
  name: string;
  city: string | null;
  location_name: string | null;
  base_amount: number;
  accepts_cash: boolean;
  accepts_qr: boolean;
  accepts_transfer: boolean;
  accepts_card: boolean;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CashPaymentMethodRow = {
  id: string;
  code: string;
  name: string;
  method_kind: "cash" | "digital" | "bank" | "card" | "other";
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CashDenominationRow = {
  id: string;
  value: number;
  label: string;
  unit_type: "billete" | "moneda";
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CashMovementRow = DeletionMetadata & {
  id: string;
  movement_type: "ingreso" | "egreso";
  amount: number;
  register_session_id: string | null;
  drawer_id: string | null;
  payment_method: string;
  source_module: string | null;
  concept: string;
  reference_name: string | null;
  city: string | null;
  movement_date: string;
  status: "registrado" | "confirmado" | "anulado";
  notes: string | null;
  movement_category: string;
  source_table: string | null;
  source_id: string | null;
  linked_label: string | null;
  auto_created: boolean;
  approved_at: string | null;
  approved_by: string | null;
  attachment_path: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CashRegisterSessionRow = DeletionMetadata & {
  id: string;
  drawer_id: string | null;
  session_date: string;
  city: string | null;
  location_name: string | null;
  opening_amount: number;
  opening_notes: string | null;
  status: "abierta" | "cerrada";
  opened_by: string | null;
  opened_at: string;
  closing_expected_amount: number | null;
  closing_counted_amount: number | null;
  closing_difference_amount: number | null;
  closing_notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CashSessionCountRow = DeletionMetadata & {
  id: string;
  session_id: string;
  count_type: "apertura" | "arqueo" | "cierre";
  expected_amount: number;
  counted_amount: number;
  difference_amount: number;
  notes: string | null;
  counted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CashSessionCountLineRow = {
  id: string;
  count_id: string;
  denomination_id: string | null;
  denomination_value: number;
  denomination_label: string;
  unit_type: "billete" | "moneda";
  quantity: number;
  subtotal: number;
  created_at: string;
};

export type CashClosureRow = DeletionMetadata & {
  id: string;
  closure_date: string;
  expected_balance: number;
  counted_balance: number;
  difference_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCashMovements(includeDeleted = false) {
  let query = supabase.from("cash_movements").select("*").order("movement_date", { ascending: false }).order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("cash_movements", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashMovementRow[];
}

export async function getCashRegisterSessions(includeDeleted = false) {
  let query = supabase.from("cash_register_sessions").select("*").order("session_date", { ascending: false }).order("opened_at", { ascending: false });
  const filter = getVisibleDeletionFilter("cash_register_sessions", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashRegisterSessionRow[];
}

export async function createCashRegisterSession(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_register_sessions").insert(data).select("*").single();
  if (error) throw error;
  return row as CashRegisterSessionRow;
}

export async function updateCashRegisterSession(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_register_sessions").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as CashRegisterSessionRow;
}

export async function closeCashRegisterSession(id: string, countedAmount: number, notes?: string | null) {
  const { data: row, error } = await supabase.rpc("close_cash_register_session", {
    p_session_id: id,
    p_counted_amount: countedAmount,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return row as CashRegisterSessionRow;
}

export async function createCashMovement(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_movements").insert(data).select("*").single();
  if (error) throw error;
  return row as CashMovementRow;
}

export async function updateCashMovement(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_movements").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as CashMovementRow;
}

export async function uploadCashMovementAttachment(file: File, movementId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `cash-movements/${movementId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function getCashMovementAttachmentUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function getCashDrawers(includeDeleted = false) {
  let query = supabase.from("cash_drawers").select("*").order("name", { ascending: true });
  const filter = getVisibleDeletionFilter("cash_drawers", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashDrawerRow[];
}

export async function createCashDrawer(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_drawers").insert(data).select("*").single();
  if (error) throw error;
  return row as CashDrawerRow;
}

export async function updateCashDrawer(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_drawers").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as CashDrawerRow;
}

export async function getCashPaymentMethods(activeOnly = false) {
  let query = supabase.from("cash_payment_methods").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashPaymentMethodRow[];
}

export async function createCashPaymentMethod(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_payment_methods").insert(data).select("*").single();
  if (error) throw error;
  return row as CashPaymentMethodRow;
}

export async function updateCashPaymentMethod(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_payment_methods").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as CashPaymentMethodRow;
}

export async function getCashDenominations(activeOnly = true) {
  let query = supabase.from("cash_denominations").select("*").order("sort_order", { ascending: true }).order("value", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashDenominationRow[];
}

export async function getCashSessionCounts(includeDeleted = false) {
  let query = supabase.from("cash_session_counts").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("cash_session_counts", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashSessionCountRow[];
}

export async function getCashSessionCountLines(countIds: string[]) {
  if (countIds.length === 0) return [] as CashSessionCountLineRow[];
  const { data, error } = await supabase
    .from("cash_session_count_lines")
    .select("*")
    .in("count_id", countIds)
    .order("denomination_value", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CashSessionCountLineRow[];
}

export async function recordCashSessionCount(input: {
  sessionId: string;
  countType: CashSessionCountRow["count_type"];
  notes?: string | null;
  lines: Array<{ denomination_id?: string | null; value: number; label: string; unit_type: "billete" | "moneda"; quantity: number }>;
}) {
  const { data, error } = await supabase.rpc("record_cash_session_count", {
    p_session_id: input.sessionId,
    p_count_type: input.countType,
    p_notes: input.notes ?? null,
    p_lines: input.lines.map((line) => ({
      denomination_id: line.denomination_id ?? null,
      value: line.value,
      label: line.label,
      unit_type: line.unit_type,
      quantity: line.quantity,
    })),
  });
  if (error) throw error;
  return data as CashSessionCountRow;
}

export async function getCashClosures(includeDeleted = false) {
  let query = supabase.from("cash_closures").select("*").order("closure_date", { ascending: false }).order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("cash_closures", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CashClosureRow[];
}

export async function createCashClosure(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_closures").insert(data).select("*").single();
  if (error) throw error;
  return row as CashClosureRow;
}

export async function updateCashClosure(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("cash_closures").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as CashClosureRow;
}
