import { supabase } from "../lib/supabaseClient";

export type GalleryAlbumRow = {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  event_date: string | null;
  description: string | null;
  cover_image: string | null;
  is_featured: boolean | null;
  is_active: boolean | null;
  created_at: string;
  gallery_images?: { image_url: string; alt_text?: string | null }[];
};

export async function getGalleryAlbums() {
  const { data, error } = await supabase.from("gallery_albums").select("*").eq("is_active", true).order("event_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GalleryAlbumRow[];
}

export async function getGalleryAlbumBySlug(slug: string) {
  const { data, error } = await supabase.from("gallery_albums").select("*, gallery_images(*)").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as GalleryAlbumRow | null;
}

export async function getAdminGalleryAlbums() {
  const { data, error } = await supabase.from("gallery_albums").select("*, gallery_images(id)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GalleryAlbumRow[];
}

export async function createGalleryAlbum(data: Record<string, unknown>) {
  const { error } = await supabase.from("gallery_albums").insert(data);
  if (error) throw error;
}

export async function updateGalleryAlbum(id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("gallery_albums").update(data).eq("id", id);
  if (error) throw error;
}

export async function deleteGalleryAlbum(id: string) {
  const { error } = await supabase.from("gallery_albums").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
