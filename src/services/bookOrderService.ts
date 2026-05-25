import { supabase } from "../lib/supabaseClient";
import { uploadPrivateFile } from "./storageService";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { normalizeDocumentNumber } from "../utils/documentNumber";

const receiptsBucket = "payment-receipts-private";

export type BookOrderRow = DeletionMetadata & {
  id: string;
  book_id: string;
  user_id: string | null;
  full_name: string;
  document_number: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  payment_receipt_path: string | null;
  payment_amount?: number | null;
  payment_method?: string | null;
  cash_movement_id?: string | null;
  cash_recorded_at?: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  verified_at: string | null;
  books?: { title: string; price?: number | null; slug?: string | null } | null;
};

export type CreateBookOrderInput = {
  book_id: string;
  user_id?: string | null;
  full_name: string;
  document_number: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  payment_receipt_path: string;
};

export async function createBookOrder(data: CreateBookOrderInput) {
  const { data: row, error } = await supabase.rpc("public_submit_book_order", {
    p_book_id: data.book_id,
    p_user_id: data.user_id ?? null,
    p_full_name: data.full_name,
    p_document_number: normalizeDocumentNumber(data.document_number),
    p_phone: data.phone ?? null,
    p_email: data.email,
    p_city: data.city ?? null,
    p_payment_receipt_path: data.payment_receipt_path,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "404") {
      throw new Error("Falta aplicar la migracion de libros en Supabase. Ejecuta npx supabase db push y vuelve a intentar.");
    }
    throw new Error(error.message || "No pudimos registrar la compra del libro.");
  }
  return (Array.isArray(row) ? row[0] : row) as BookOrderRow;
}

export async function uploadPaymentReceipt(file: File, orderKey?: string | null) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const folder = (orderKey ?? crypto.randomUUID()).replace(/[^0-9A-Za-z_-]/g, "").slice(0, 48) || crypto.randomUUID();
  const path = `books/${folder}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function attachPaymentReceipt(orderId: string, payment_receipt_path: string) {
  const { error } = await supabase
    .from("book_orders")
    .update({ payment_receipt_path, status: "En revision" })
    .eq("id", orderId);
  if (error) throw error;
}

export async function getMyBookOrders(userId: string) {
  const { data, error } = await supabase
    .from("book_orders")
    .select("*, books(title, price, slug)")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookOrderRow[];
}

export async function getBookOrdersAdmin(includeDeleted = false) {
  let query = supabase.from("book_orders").select("*, books(title, price, slug)").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("book_orders", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BookOrderRow[];
}

export async function updateBookOrderStatus(orderId: string, status: string) {
  const { error } = await supabase.from("book_orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}

export async function verifyBookOrder(
  orderId: string,
  input: {
    adminNotes?: string | null;
    paymentAmount: number;
    paymentMethod: string;
  }
) {
  const { data: row, error } = await supabase
    .from("book_orders")
    .update({
      status: "Aprobado",
      admin_notes: input.adminNotes ?? null,
      payment_amount: input.paymentAmount,
      payment_method: input.paymentMethod,
      verified_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*")
    .single();
  if (error) throw error;
  return row as BookOrderRow;
}

export async function updateBookOrderNotes(orderId: string, adminNotes: string) {
  const { error } = await supabase.from("book_orders").update({ admin_notes: adminNotes }).eq("id", orderId);
  if (error) throw error;
}
