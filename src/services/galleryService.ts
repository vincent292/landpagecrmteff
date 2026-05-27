import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { resolvePublicMediaFields } from "./publicMediaResolver";

export type GalleryAlbumRow = DeletionMetadata & {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  event_date: string | null;
  description: string | null;
  cover_image: string | null;
  category?: string | null;
  video_url?: string | null;
  treatment_name?: string | null;
  is_public?: boolean | null;
  is_featured: boolean | null;
  is_active: boolean | null;
  doctor_id?: string | null;
  created_by?: string | null;
  doctor_profiles?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
  created_at: string;
  gallery_images?: {
    image_url: string;
    alt_text?: string | null;
    media_type?: string | null;
    caption?: string | null;
    thumbnail_url?: string | null;
    display_order?: number | null;
  }[];
};

function resolveGalleryAlbum(row: GalleryAlbumRow) {
  return {
    ...resolvePublicMediaFields(row, ["cover_image", "video_url"]),
    doctor_profiles: row.doctor_profiles
      ? resolvePublicMediaFields(row.doctor_profiles, ["photo_url"])
      : null,
    gallery_images: row.gallery_images?.map((image) =>
      resolvePublicMediaFields(image, ["image_url", "thumbnail_url"])
    ),
  } satisfies GalleryAlbumRow;
}

export async function getGalleryAlbums() {
  const { data, error } = await supabase
    .from("gallery_albums")
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("event_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as GalleryAlbumRow[]).map(resolveGalleryAlbum);
}

export async function getGalleryAlbumBySlug(slug: string) {
  const { data, error } = await supabase
    .from("gallery_albums")
    .select("*, gallery_images(*), doctor_profiles(full_name, specialty, photo_url)")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? resolveGalleryAlbum(data as GalleryAlbumRow) : null;
}

export async function getAdminGalleryAlbums(includeDeleted = false, doctorId?: string | null) {
  let query = supabase
    .from("gallery_albums")
    .select("*, gallery_images(id), doctor_profiles(full_name, specialty, photo_url)")
    .order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("gallery_albums", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as GalleryAlbumRow[]).map(resolveGalleryAlbum);
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
