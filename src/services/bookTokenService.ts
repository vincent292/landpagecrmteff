import { supabase } from "../lib/supabaseClient";
import { getSignedUrl } from "./storageService";

export type BookTokenRow = {
  id: string;
  book_id: string;
  order_id: string;
  user_id: string;
  token: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  books?: { file_path: string | null; title?: string | null } | null;
  book_orders?: { full_name?: string | null } | null;
};

const filesBucket = "book-files-private";

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
  const { data, error } = await supabase
    .from("book_download_tokens")
    .select("*, books(title), book_orders(full_name)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookTokenRow[];
}

export async function getMyTokens(userId: string) {
  const { data, error } = await supabase
    .from("book_download_tokens")
    .select("*, books(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookTokenRow[];
}

export async function getAllTokensAdmin() {
  const { data, error } = await supabase
    .from("book_download_tokens")
    .select("*, books(title), book_orders(full_name)")
    .order("created_at", { ascending: false });
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
  const { data, error } = await supabase.rpc("public_download_book_with_token", {
    p_token: token,
  });
  if (error) throw new Error(error.message || "Token invalido o agotado.");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.signed_file_path) throw new Error("Token invalido o agotado.");

  const signedUrl = await getSignedUrl(filesBucket, row.signed_file_path, 60 * 5);
  const { error: consumeError } = await supabase.rpc("public_consume_book_token", {
    p_token: token,
  });
  if (consumeError) throw new Error(consumeError.message || "Token invalido o agotado.");

  return { signedUrl, token: row.token_value, title: row.book_title ?? "Libro" };
}

export async function deactivateToken(tokenId: string) {
  const { error } = await supabase.from("book_download_tokens").update({ is_active: false }).eq("id", tokenId);
  if (error) throw error;
}

export async function updateBookToken(tokenId: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("book_download_tokens").update(data).eq("id", tokenId);
  if (error) throw error;
}
