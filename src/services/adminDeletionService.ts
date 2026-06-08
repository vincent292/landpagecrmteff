import { supabase } from "../lib/supabaseClient";
import { deleteFile } from "./storageService";
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
  | "inventory_counts"
  | "inventory_supplier_orders"
  | "promotion_orders"
  | "savings_cards"
  | "payment_plans";

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
  inventory_supplier_orders: "deleted",
  promotion_orders: "deleted",
  savings_cards: "deleted",
  payment_plans: "deleted",
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

async function deleteStorageFileIfPresent(bucket: string, path?: string | null) {
  if (!path) return;
  try {
    await deleteFile(bucket, path);
  } catch (error) {
    if (isStorageNotFoundError(error)) return;
    throw error;
  }
}

function isStorageNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("does not exist") || message.includes("no such object");
}

async function deleteLinkedCashMovement(id?: string | null) {
  if (!id) return;

  const { data, error } = await supabase.from("cash_movements").select("attachment_path").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return;

  await deleteStorageFileIfPresent("payment-receipts-private", data.attachment_path);

  const { error: deleteError } = await supabase.from("cash_movements").delete().eq("id", id);
  if (deleteError) throw deleteError;
}

async function cleanupBeforeHardDelete(table: DeletableTable, id: string) {
  switch (table) {
    case "course_enrollments": {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("payment_receipt_path, cash_movement_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteStorageFileIfPresent("payment-receipts-private", data.payment_receipt_path);
      await deleteLinkedCashMovement(data.cash_movement_id);
      return;
    }
    case "book_orders": {
      const { data, error } = await supabase
        .from("book_orders")
        .select("payment_receipt_path, cash_movement_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteStorageFileIfPresent("payment-receipts-private", data.payment_receipt_path);
      await deleteLinkedCashMovement(data.cash_movement_id);
      const { error: tokensError } = await supabase.from("book_download_tokens").delete().eq("order_id", id);
      if (tokensError) throw tokensError;
      return;
    }
    case "promotion_orders": {
      const { data, error } = await supabase
        .from("promotion_orders")
        .select("payment_receipt_path, cash_movement_id, appointment_reservation_id, promotion_order_items(appointment_reservation_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;

      await deleteStorageFileIfPresent("payment-receipts-private", data.payment_receipt_path);
      await deleteLinkedCashMovement(data.cash_movement_id);

      const reservationIds = [
        data.appointment_reservation_id,
        ...(data.promotion_order_items ?? []).map((item: { appointment_reservation_id: string | null }) => item.appointment_reservation_id),
      ].filter((value): value is string => Boolean(value));

      for (const reservationId of new Set(reservationIds)) {
        await hardDeleteRecord("appointment_reservations", reservationId);
      }
      return;
    }
    case "appointment_reservations": {
      const { data, error } = await supabase
        .from("appointment_reservations")
        .select("payment_receipt_path, cash_movement_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteStorageFileIfPresent("payment-receipts-private", data.payment_receipt_path);
      await deleteLinkedCashMovement(data.cash_movement_id);
      return;
    }
    case "appointments": {
      const { data, error } = await supabase
        .from("appointments")
        .select("cash_movement_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteLinkedCashMovement(data.cash_movement_id);
      return;
    }
    case "patient_photos": {
      const { data, error } = await supabase
        .from("patient_photos")
        .select("image_path")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteStorageFileIfPresent("patient-photos-private", data.image_path);
      return;
    }
    case "books": {
      const { data, error } = await supabase
        .from("books")
        .select("file_path")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteStorageFileIfPresent("book-files-private", data.file_path);
      return;
    }
    case "cash_movements": {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("attachment_path")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await deleteStorageFileIfPresent("payment-receipts-private", data.attachment_path);
      return;
    }
    case "inventory_supplier_orders": {
      const { data, error } = await supabase
        .from("inventory_supplier_orders")
        .select("document_path, inventory_supplier_order_payments(receipt_path, cash_movement_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;

      await deleteStorageFileIfPresent("payment-receipts-private", data.document_path);

      for (const payment of data.inventory_supplier_order_payments ?? []) {
        await deleteStorageFileIfPresent("payment-receipts-private", payment.receipt_path);
        await deleteLinkedCashMovement(payment.cash_movement_id);
      }
      return;
    }
    case "savings_cards": {
      const { data: installments, error: installmentsError } = await supabase
        .from("savings_card_installments")
        .select("id, cash_movement_id")
        .eq("card_id", id);
      if (installmentsError) throw installmentsError;

      const installmentIds = (installments ?? []).map((item) => item.id);
      const installmentMovementIds = (installments ?? [])
        .map((item) => item.cash_movement_id)
        .filter((value): value is string => Boolean(value));

      if (installmentIds.length > 0) {
        const { data: receipts, error: receiptsError } = await supabase
          .from("savings_card_receipts")
          .select("id, receipt_path")
          .in("installment_id", installmentIds);
        if (receiptsError) throw receiptsError;

        for (const receipt of receipts ?? []) {
          await deleteStorageFileIfPresent("payment-receipts-private", receipt.receipt_path);
        }

        const { error: receiptsDeleteError } = await supabase
          .from("savings_card_receipts")
          .delete()
          .in("installment_id", installmentIds);
        if (receiptsDeleteError) throw receiptsDeleteError;
      }

      const { data: redemption, error: redemptionError } = await supabase
        .from("savings_card_redemptions")
        .select("id, cash_movement_id")
        .eq("card_id", id)
        .maybeSingle();
      if (redemptionError) throw redemptionError;

      for (const movementId of new Set(installmentMovementIds)) {
        await deleteLinkedCashMovement(movementId);
      }

      if (redemption?.cash_movement_id) {
        await deleteLinkedCashMovement(redemption.cash_movement_id);
      }

      if (installmentIds.length > 0) {
        const { error: installmentsDeleteError } = await supabase
          .from("savings_card_installments")
          .delete()
          .in("id", installmentIds);
        if (installmentsDeleteError) throw installmentsDeleteError;
      }

      const { error: redemptionDeleteError } = await supabase
        .from("savings_card_redemptions")
        .delete()
        .eq("card_id", id);
      if (redemptionDeleteError) throw redemptionDeleteError;
      return;
    }
    case "payment_plans": {
      const { data: plan, error: planError } = await supabase
        .from("payment_plans")
        .select("initial_payment_cash_movement_id")
        .eq("id", id)
        .maybeSingle();
      if (planError) throw planError;

      const { data: installments, error: installmentsError } = await supabase
        .from("payment_plan_installments")
        .select("id, cash_movement_id")
        .eq("plan_id", id);
      if (installmentsError) throw installmentsError;

      const installmentIds = (installments ?? []).map((item) => item.id);
      const movementIds = [
        plan?.initial_payment_cash_movement_id ?? null,
        ...((installments ?? []).map((item) => item.cash_movement_id) ?? []),
      ].filter((value): value is string => Boolean(value));

      if (installmentIds.length > 0) {
        const { data: receipts, error: receiptsError } = await supabase
          .from("payment_plan_receipts")
          .select("id, receipt_path")
          .in("installment_id", installmentIds);
        if (receiptsError) throw receiptsError;

        for (const receipt of receipts ?? []) {
          await deleteStorageFileIfPresent("payment-receipts-private", receipt.receipt_path);
        }

        const { error: receiptsDeleteError } = await supabase
          .from("payment_plan_receipts")
          .delete()
          .in("installment_id", installmentIds);
        if (receiptsDeleteError) throw receiptsDeleteError;
      }

      for (const movementId of new Set(movementIds)) {
        await deleteLinkedCashMovement(movementId);
      }

      if (installmentIds.length > 0) {
        const { error: installmentsDeleteError } = await supabase
          .from("payment_plan_installments")
          .delete()
          .in("id", installmentIds);
        if (installmentsDeleteError) throw installmentsDeleteError;
      }
      return;
    }
    default:
      return;
  }
}

export async function hardDeleteRecord(table: DeletableTable, id: string) {
  await cleanupBeforeHardDelete(table, id);
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
