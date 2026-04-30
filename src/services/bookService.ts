import { slugify } from "../utils/text";
import { supabase } from "../lib/supabaseClient";
import { uploadPrivateFile, uploadPublicFile } from "./storageService";

const coversBucket = "book-covers-public";
const filesBucket = "book-files-private";

export type BookRow = {
  id: string;
  title: string;
  slug: string;
  author: string;
  description: string | null;
  cover_image: string | null;
  file_path: string | null;
  price: number;
  qr_payment_image: string | null;
  download_token_mode: "single_use" | "multiple_use";
  default_token_max_uses: number;
  is_active: boolean;
  created_at: string;
};

export async function getActiveBooks() {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookRow[];
}

export async function getBookBySlug(slug: string) {
  const { data, error } = await supabase.from("books").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as BookRow | null;
}

export async function getBookById(id: string) {
  const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as BookRow | null;
}

export async function getBooksAdmin() {
  const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookRow[];
}

export async function createBook(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("books").insert(data).select("*").single();
  if (error) throw error;
  return row as BookRow;
}

export async function updateBook(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("books").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as BookRow;
}

export async function deleteBook(id: string) {
  const { error } = await supabase.from("books").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export async function uploadBookCover(file: File) {
  const path = `covers/${slugify(file.name)}-${crypto.randomUUID()}`;
  return uploadPublicFile(coversBucket, path, file);
}

export async function uploadBookFile(file: File) {
  const fileExt = file.name.split(".").pop() ?? "pdf";
  const path = `books/${slugify(file.name)}-${crypto.randomUUID()}.${fileExt}`;
  return uploadPrivateFile(filesBucket, path, file);
}

export async function uploadBookQr(file: File) {
  const path = `payments/${slugify(file.name)}-${crypto.randomUUID()}`;
  return uploadPublicFile(coversBucket, path, file);
}
