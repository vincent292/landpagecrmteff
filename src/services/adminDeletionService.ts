import { supabase } from "../lib/supabaseClient";
import type { UserRole } from "../types/platform";

export type DeletionMetadata = {
  is_deleted?: boolean | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_by_role?: string | null;
  deleted_by_name?: string | null;
  deleted_by_email?: string | null;
};

export type DeletableTable =
  | "profiles"
  | "patients"
  | "treatments"
  | "promotions"
  | "information_requests"
  | "courses"
  | "course_enrollments"
  | "calendar_events"
  | "gallery_albums"
  | "clinical_histories"
  | "clinical_evolutions"
  | "patient_photos"
  | "photo_comparisons"
  | "appointments"
  | "patient_prescriptions"
  | "post_treatment_cares"
  | "books"
  | "book_orders"
  | "book_download_tokens"
  | "doctor_profiles"
  | "doctor_availability_rules"
  | "availability_blocks"
  | "appointment_reservations"
  | "inventory_items"
  | "inventory_adjustments"
  | "cash_movements"
  | "cash_closures"
  | "cash_drawers"
  | "inventory_locations"
  | "cash_register_sessions"
  | "cash_session_counts"
  | "inventory_categories"
  | "inventory_units"
  | "inventory_suppliers"
  | "inventory_lots"
  | "inventory_movements"
  | "inventory_counts";

type DeleteMode = "active" | "deleted";

const tableModes: Record<DeletableTable, DeleteMode> = {
  profiles: "deleted",
  patients: "deleted",
  treatments: "active",
  promotions: "active",
  information_requests: "deleted",
  courses: "active",
  course_enrollments: "deleted",
  calendar_events: "active",
  gallery_albums: "active",
  clinical_histories: "deleted",
  clinical_evolutions: "deleted",
  patient_photos: "deleted",
  photo_comparisons: "deleted",
  appointments: "deleted",
  patient_prescriptions: "deleted",
  post_treatment_cares: "deleted",
  books: "active",
  book_orders: "deleted",
  book_download_tokens: "active",
  doctor_profiles: "active",
  doctor_availability_rules: "active",
  availability_blocks: "active",
  appointment_reservations: "deleted",
  inventory_items: "deleted",
  inventory_adjustments: "deleted",
  cash_movements: "deleted",
  cash_closures: "deleted",
  cash_drawers: "deleted",
  inventory_locations: "deleted",
  cash_register_sessions: "deleted",
  cash_session_counts: "deleted",
  inventory_categories: "deleted",
  inventory_units: "deleted",
  inventory_suppliers: "deleted",
  inventory_lots: "deleted",
  inventory_movements: "deleted",
  inventory_counts: "deleted",
};

export function canHardDelete(role: UserRole) {
  return role === "superadmin";
}

export function canSoftDelete(role: UserRole) {
  return ["superadmin", "admin", "doctor", "assistant"].includes(role);
}

export function isSoftDeleted(row?: DeletionMetadata | null) {
  if (!row) return false;
  if (typeof row.is_deleted === "boolean") return row.is_deleted;
  return Boolean(row.deleted_at);
}

export function getVisibleDeletionFilter(table: DeletableTable, includeDeleted: boolean) {
  if (includeDeleted) return { column: null, value: null };
  if (tableModes[table] === "active") return { column: "deleted_at", value: null };
  return { column: "is_deleted", value: false };
}

export async function softDeleteRecord(params: {
  table: DeletableTable;
  id: string;
  actorId?: string | null;
  actorRole: UserRole;
  actorName?: string | null;
  actorEmail?: string | null;
}) {
  const mode = tableModes[params.table];
  const basePayload = {
    deleted_at: new Date().toISOString(),
    deleted_by: params.actorId ?? null,
    deleted_by_role: params.actorRole,
    deleted_by_name: params.actorName ?? null,
    deleted_by_email: params.actorEmail ?? null,
  };

  const payload =
    mode === "active"
      ? { ...basePayload, is_active: false }
      : { ...basePayload, is_deleted: true };

  const { error } = await supabase.from(params.table).update(payload).eq("id", params.id);
  if (error) throw error;
}

export async function restoreRecord(table: DeletableTable, id: string) {
  const mode = tableModes[table];
  const payload =
    mode === "active"
      ? {
          deleted_at: null,
          deleted_by: null,
          deleted_by_role: null,
          deleted_by_name: null,
          deleted_by_email: null,
        }
      : {
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
          deleted_by_role: null,
          deleted_by_name: null,
          deleted_by_email: null,
        };

  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) throw error;
}

export async function hardDeleteRecord(table: DeletableTable, id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
