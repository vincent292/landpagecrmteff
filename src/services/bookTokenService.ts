import { supabase } from "../lib/supabaseClient";
import { downloadBookFileWithTokenFromR2 } from "./r2PrivateStorageService";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";

export type BookTokenRow = DeletionMetadata & {
  id: string;
  book_id: string;
  order_id: string;
  user_id: string | null;
  token: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  books?: { file_path: string | null; title?: string | null } | null;
  book_orders?: { full_name?: string | null } | null;
};

export async function generateBookToken(orderId: string, options?: { maxUses?: number; expiresAt?: string | null }) {
  const { data: order, error: orderError } = await supabase
    .from("book_orders")
    .select("*, books(*)")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  const tokenMode = order.books?.download_token_mode ?? "single_use";
  const maxUses =
    tokenMode === "single_use"
      ? 1
      : options?.maxUses ?? order.books?.default_token_max_uses ?? 3;

  const payload = {
    book_id: order.book_id,
    order_id: order.id,
    user_id: order.user_id,
    token: crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase(),
    max_uses: maxUses,
    expires_at: options?.expiresAt ?? null,
    is_active: true,
  };

  const { data, error } = await supabase.from("book_download_tokens").insert(payload).select("*").single();
  if (error) throw error;
  return data as BookTokenRow;
}

export async function getTokensByOrder(orderId: string) {
  let query = supabase
    .from("book_download_tokens")
    .select("*, books(title), book_orders(full_name)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("book_download_tokens", false);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BookTokenRow[];
}

export async function getMyTokens(userId: string) {
  let query = supabase
    .from("book_download_tokens")
    .select("*, books(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("book_download_tokens", false);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BookTokenRow[];
}

export async function getAllTokensAdmin(includeDeleted = false) {
  let query = supabase.from("book_download_tokens").select("*, books(title), book_orders(full_name)").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("book_download_tokens", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BookTokenRow[];
}

export async function validateToken(token: string) {
  const { data, error } = await supabase
    .from("book_download_tokens")
    .select("*, books(file_path, title)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const expired = data.expires_at ? new Date(data.expires_at).getTime() < Date.now() : false;
  const exhausted = data.used_count >= data.max_uses;
  const valid = data.is_active && !expired && !exhausted;

  return { ...(data as BookTokenRow), valid, expired, exhausted };
}

export async function downloadBookWithToken(token: string) {
  const result = await downloadBookFileWithTokenFromR2(token, 60 * 5);
  return { signedUrl: result.signedUrl, token: result.token, title: result.title };
}

export async function deactivateToken(tokenId: string) {
  const { error } = await supabase.from("book_download_tokens").update({ is_active: false }).eq("id", tokenId);
  if (error) throw error;
}

export async function updateBookToken(tokenId: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("book_download_tokens").update(data).eq("id", tokenId);
  if (error) throw error;
}
