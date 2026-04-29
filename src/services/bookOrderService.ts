import { supabase } from "../lib/supabaseClient";
import { uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type BookOrderRow = {
  id: string;
  book_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  payment_receipt_path: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  verified_at: string | null;
  books?: { title: string } | null;
};

export async function createBookOrder(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("book_orders").insert(data).select("*").single();
  if (error) throw error;
  return row as BookOrderRow;
}

export async function uploadPaymentReceipt(file: File, orderId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${orderId}/${crypto.randomUUID()}.${ext}`;
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
    .select("*, books(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookOrderRow[];
}

export async function getBookOrdersAdmin() {
  const { data, error } = await supabase
    .from("book_orders")
    .select("*, books(title)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookOrderRow[];
}

export async function updateBookOrderStatus(orderId: string, status: string) {
  const { error } = await supabase.from("book_orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}

export async function verifyBookOrder(orderId: string, adminNotes: string) {
  const { data: row, error } = await supabase
    .from("book_orders")
    .update({ status: "Aprobado", admin_notes: adminNotes, verified_at: new Date().toISOString() })
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
