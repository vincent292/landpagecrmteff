import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { attachDoctorProfile, attachDoctorProfiles } from "./contentDoctorService";

export type PromotionVariantRow = {
  id: string;
  promotion_id: string;
  title: string;
  price_total: number;
  available_slots: number;
  approved_slots: number;
  allows_partial_payment: boolean;
  partial_payment_percent: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromotionVariantInput = {
  id?: string;
  title: string;
  price_total: number;
  available_slots: number;
  allows_partial_payment: boolean;
  partial_payment_percent: number;
  is_active?: boolean;
};

export type PromotionRow = DeletionMetadata & {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  old_price: number | null;
  promo_price: number | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  available_slots: number | null;
  assessment_price?: number | null;
  is_active: boolean | null;
  doctor_id: string | null;
  requires_assessment?: boolean | null;
  allows_direct_booking?: boolean | null;
  allows_partial_payment?: boolean | null;
  partial_payment_percent?: number | null;
  agenda_mode?: "none" | "coordinate" | "choose_slot" | null;
  appointment_type?: string | null;
  agenda_tag?: string | null;
  promotion_variants?: PromotionVariantRow[] | null;
  doctor_profiles?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
  created_at: string;
};

const promotionSelect = "*, doctor_profiles(full_name, specialty, photo_url), promotion_variants(*)";

function normalizePromotionRows(rows: PromotionRow[]) {
  return attachDoctorProfiles(
    rows.map((row) => ({
      ...row,
      promotion_variants: (row.promotion_variants ?? [])
        .filter((variant) => variant.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    }))
  );
}

function normalizePromotionRow(row: PromotionRow | null) {
  if (!row) return null;
  return attachDoctorProfile({
    ...row,
    promotion_variants: (row.promotion_variants ?? [])
      .filter((variant) => variant.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
  });
}

export function getPromotionVariantRemainingSlots(variant?: Pick<PromotionVariantRow, "available_slots" | "approved_slots"> | null) {
  if (!variant) return 0;
  return Math.max(Number(variant.available_slots ?? 0) - Number(variant.approved_slots ?? 0), 0);
}

export function variantsToTextarea(variants?: PromotionVariantRow[] | null) {
  return (variants ?? [])
    .map((variant) =>
      [
        variant.id,
        variant.title,
        String(Number(variant.price_total ?? 0)),
        String(Number(variant.available_slots ?? 0)),
        variant.allows_partial_payment ? "si" : "no",
        String(Number(variant.partial_payment_percent ?? 0)),
        variant.is_active ? "si" : "no",
      ].join("|")
    )
    .join("\n");
}

export function parsePromotionVariantsTextarea(value?: string | null) {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [id, title, priceRaw, slotsRaw, partialRaw, percentRaw, activeRaw] = line.split("|").map((item) => item.trim());
      const isActive = activeRaw ? !["no", "false", "0"].includes(activeRaw.toLowerCase()) : true;
      return {
        id: id || undefined,
        title: title ?? "",
        price_total: Number(priceRaw ?? 0),
        available_slots: Number(slotsRaw ?? 0),
        allows_partial_payment: ["si", "sí", "true", "1"].includes((partialRaw ?? "").toLowerCase()),
        partial_payment_percent: Number(percentRaw ?? 0) || 0,
        is_active: isActive,
        sort_order: index,
      };
    })
    .filter((variant) => variant.title.trim().length > 0 && variant.price_total > 0);
}

async function syncPromotionVariants(promotionId: string, variants: PromotionVariantInput[]) {
  const { data: existingRows, error: existingError } = await supabase
    .from("promotion_variants")
    .select("*")
    .eq("promotion_id", promotionId);
  if (existingError) throw existingError;

  const existing = (existingRows ?? []) as PromotionVariantRow[];
  const nextIds = new Set(variants.map((variant) => variant.id).filter(Boolean));
  const removedIds = existing.filter((row) => !nextIds.has(row.id)).map((row) => row.id);

  if (removedIds.length > 0) {
    const { error } = await supabase.from("promotion_variants").update({ is_active: false }).in("id", removedIds);
    if (error) throw error;
  }

  for (const [index, variant] of variants.entries()) {
    const payload = {
      promotion_id: promotionId,
      title: variant.title,
      price_total: variant.price_total,
      available_slots: variant.available_slots,
      allows_partial_payment: variant.allows_partial_payment,
      partial_payment_percent: variant.partial_payment_percent,
      is_active: variant.is_active ?? true,
      sort_order: index,
    };

    if (variant.id) {
      const { error } = await supabase.from("promotion_variants").update(payload).eq("id", variant.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("promotion_variants").insert(payload);
      if (error) throw error;
    }
  }
}

export async function getActivePromotions() {
  const { data, error } = await supabase
    .from("promotions")
    .select(promotionSelect)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizePromotionRows((data ?? []) as PromotionRow[]);
}

export async function getPromotionBySlug(slug: string) {
  const { data, error } = await supabase
    .from("promotions")
    .select(promotionSelect)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return normalizePromotionRow(data as PromotionRow | null);
}

export async function getAdminPromotions(includeDeleted = false) {
  let query = supabase.from("promotions").select(promotionSelect).order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("promotions", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return normalizePromotionRows((data ?? []) as PromotionRow[]);
}

export async function createPromotion(data: Record<string, unknown>, variants: PromotionVariantInput[] = []) {
  const { data: row, error } = await supabase.from("promotions").insert(data).select("*").single();
  if (error) throw error;
  if (variants.length > 0) {
    await syncPromotionVariants((row as PromotionRow).id, variants);
  }
  return row as PromotionRow;
}

export async function updatePromotion(id: string, data: Record<string, unknown>, variants: PromotionVariantInput[] = []) {
  const { error } = await supabase.from("promotions").update(data).eq("id", id);
  if (error) throw error;
  await syncPromotionVariants(id, variants);
}

export async function deletePromotion(id: string) {
  const { error } = await supabase.from("promotions").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
