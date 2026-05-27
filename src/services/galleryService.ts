import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { resolvePublicMediaFields } from "./publicMediaResolver";

export type GalleryDisplayMode = "carousel" | "comparison";

export type GalleryMediaRow = {
  id?: string;
  image_url: string;
  alt_text?: string | null;
  media_type?: string | null;
  caption?: string | null;
  thumbnail_url?: string | null;
  display_order?: number | null;
};

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
  display_mode?: GalleryDisplayMode | null;
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
  gallery_images?: GalleryMediaRow[];
};

function compareDisplayOrder(a: GalleryMediaRow, b: GalleryMediaRow) {
  return Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
}

function dedupeGalleryMedia(items: GalleryMediaRow[]) {
  return Array.from(new Map(items.map((item) => [item.image_url, item])).values());
}

export function getGalleryMediaItems(row: GalleryAlbumRow) {
  const items = [
    ...(row.gallery_images ?? []),
    row.video_url
      ? {
          image_url: row.video_url,
          media_type: "video",
          caption: row.title,
          display_order: -2,
        }
      : null,
    row.cover_image
      ? {
          image_url: row.cover_image,
          media_type: "image",
          caption: row.title,
          display_order: -1,
        }
      : null,
  ].filter(Boolean) as GalleryMediaRow[];

  return dedupeGalleryMedia(items).sort(compareDisplayOrder);
}

function resolveGalleryAlbum(row: GalleryAlbumRow) {
  return {
    ...resolvePublicMediaFields(row, ["cover_image", "video_url"]),
    doctor_profiles: row.doctor_profiles
      ? resolvePublicMediaFields(row.doctor_profiles, ["photo_url"])
      : null,
    gallery_images: row.gallery_images
      ?.map((image) => resolvePublicMediaFields(image, ["image_url", "thumbnail_url"]))
      .sort(compareDisplayOrder),
  } satisfies GalleryAlbumRow;
}

export async function getGalleryAlbums() {
  const { data, error } = await supabase
    .from("gallery_albums")
    .select("*, gallery_images(*), doctor_profiles(full_name, specialty, photo_url)")
    .eq("is_active", true)
    .or("is_public.is.null,is_public.eq.true")
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
    .or("is_public.is.null,is_public.eq.true")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? resolveGalleryAlbum(data as GalleryAlbumRow) : null;
}

export async function getAdminGalleryAlbums(includeDeleted = false, doctorId?: string | null) {
  let query = supabase
    .from("gallery_albums")
    .select("*, gallery_images(*), doctor_profiles(full_name, specialty, photo_url)")
    .order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("gallery_albums", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as GalleryAlbumRow[]).map(resolveGalleryAlbum);
}

function normalizeGalleryMedia(items: unknown) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as GalleryMediaRow;
      if (!row.image_url?.trim()) return null;

      return {
        image_url: row.image_url.trim(),
        alt_text: row.alt_text?.trim() || null,
        media_type: row.media_type?.trim() || "image",
        caption: row.caption?.trim() || null,
        thumbnail_url: row.thumbnail_url?.trim() || null,
        display_order: Number(row.display_order ?? index),
      } satisfies GalleryMediaRow;
    })
    .filter(Boolean) as GalleryMediaRow[];
}

async function replaceGalleryImages(albumId: string, items: GalleryMediaRow[]) {
  const { error: deleteError } = await supabase.from("gallery_images").delete().eq("album_id", albumId);
  if (deleteError) throw deleteError;

  if (items.length === 0) return;

  const { error } = await supabase.from("gallery_images").insert(
    items.map((item, index) => ({
      album_id: albumId,
      image_url: item.image_url,
      alt_text: item.alt_text ?? null,
      media_type: item.media_type ?? "image",
      caption: item.caption ?? null,
      thumbnail_url: item.thumbnail_url ?? null,
      display_order: Number(item.display_order ?? index),
    }))
  );
  if (error) throw error;
}

export async function createGalleryAlbum(data: Record<string, unknown>) {
  const { gallery_images, ...albumData } = data;
  const mediaItems = normalizeGalleryMedia(gallery_images);
  const { data: row, error } = await supabase.from("gallery_albums").insert(albumData).select("id").single();
  if (error) throw error;
  await replaceGalleryImages(row.id, mediaItems);
}

export async function updateGalleryAlbum(id: string, data: Record<string, unknown>) {
  const { gallery_images, ...albumData } = data;
  const mediaItems = normalizeGalleryMedia(gallery_images);
  const { error } = await supabase.from("gallery_albums").update(albumData).eq("id", id);
  if (error) throw error;
  await replaceGalleryImages(id, mediaItems);
}

export async function deleteGalleryAlbum(id: string) {
  const { error } = await supabase.from("gallery_albums").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
