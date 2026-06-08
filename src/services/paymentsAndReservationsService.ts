import type { UserRole } from "../types/platform";
import { shouldHidePatientPhone } from "../lib/patientPrivacy";
import {
  getCourseEnrollments,
  type EnrollmentRow,
} from "./enrollmentService";
import { getBookOrdersAdmin, type BookOrderRow } from "./bookOrderService";
import {
  getPromotionOrdersAdmin,
  type PromotionOrderRow,
} from "./promotionOrderService";
import {
  getReservationsAdmin,
  type AppointmentReservationRow,
} from "./reservationService";

export type PaymentsAndReservationsKind =
  | "promotion"
  | "course"
  | "book"
  | "reservation";

export type PaymentsAndReservationsItem =
  | {
      id: string;
      kind: "promotion";
      createdAt: string;
      title: string;
      customerName: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      statusLabel: PromotionOrderRow["status"];
      statusGroup: "pending" | "approved" | "rejected" | "cancelled";
      amountExpected: number;
      amountPaid: number;
      paymentMethod: string | null;
      receiptPath: string | null;
      notes: string | null;
      doctorId: string | null;
      fixedAmount: true;
      sourceLabel: string;
      row: PromotionOrderRow;
    }
  | {
      id: string;
      kind: "course";
      createdAt: string;
      title: string;
      customerName: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      statusLabel: string;
      statusGroup: "pending" | "approved" | "rejected" | "cancelled";
      amountExpected: number;
      amountPaid: number;
      paymentMethod: string | null;
      receiptPath: string | null;
      notes: string | null;
      doctorId: null;
      fixedAmount: boolean;
      sourceLabel: string;
      row: EnrollmentRow;
    }
  | {
      id: string;
      kind: "book";
      createdAt: string;
      title: string;
      customerName: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      statusLabel: string;
      statusGroup: "pending" | "approved" | "rejected" | "cancelled";
      amountExpected: number;
      amountPaid: number;
      paymentMethod: string | null;
      receiptPath: string | null;
      notes: string | null;
      doctorId: null;
      fixedAmount: boolean;
      sourceLabel: string;
      row: BookOrderRow;
    }
  | {
      id: string;
      kind: "reservation";
      reservationCategory: "assessment" | "manual" | "reservation";
      createdAt: string;
      title: string;
      customerName: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      statusLabel: AppointmentReservationRow["status"];
      statusGroup: "pending" | "approved" | "rejected" | "cancelled";
      amountExpected: number;
      amountPaid: number;
      paymentMethod: string | null;
      receiptPath: string | null;
      notes: string | null;
      doctorId: string | null;
      fixedAmount: boolean;
      sourceLabel: string;
      row: AppointmentReservationRow;
    };

function toStatusGroup(
  kind: PaymentsAndReservationsKind,
  status: string
): PaymentsAndReservationsItem["statusGroup"] {
  const normalized = status.trim().toLowerCase();

  if (normalized === "aprobado" || normalized === "confirmado" || normalized === "confirmada") {
    return "approved";
  }
  if (normalized === "rechazado" || normalized === "rechazada") {
    return "rejected";
  }
  if (normalized === "cancelado" || normalized === "cancelada") {
    return "cancelled";
  }
  if (kind === "reservation" && normalized === "realizada") {
    return "approved";
  }
  return "pending";
}

export function isPaymentManagedReservation(
  row: Pick<
    AppointmentReservationRow,
    "payment_receipt_path" | "payment_amount" | "payment_expires_at" | "source" | "title" | "appointment_type"
  >
) {
  const source = `${row.source ?? ""} ${row.title ?? ""} ${row.appointment_type ?? ""}`.toLowerCase();
  return Boolean(
    row.payment_receipt_path ||
      row.payment_amount ||
      row.payment_expires_at ||
      source.includes("admin_manual") ||
      source.includes("assessment") ||
      source.includes("valoracion") ||
      source.includes("promocion")
  );
}

export async function getPaymentsAndReservationsFeed(options?: {
  role?: UserRole;
  doctorProfileId?: string | null;
}) {
  const includeDeleted = options?.role === "superadmin";
  const [promotionRows, courseRows, bookRows, reservationRows] = await Promise.all([
    getPromotionOrdersAdmin(includeDeleted),
    getCourseEnrollments(includeDeleted),
    getBookOrdersAdmin(includeDeleted),
    getReservationsAdmin({}, includeDeleted, options?.role),
  ]);

  const promotionItems: PaymentsAndReservationsItem[] = promotionRows.map((row) => ({
    id: row.id,
    kind: "promotion",
    createdAt: row.created_at,
    title: row.promotions?.title ?? "Promocion",
    customerName: row.full_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    city: row.city ?? null,
    statusLabel: row.status,
    statusGroup: toStatusGroup("promotion", row.status),
    amountExpected: Number(row.total_amount ?? 0),
    amountPaid: Number(row.amount_paid ?? row.total_amount ?? 0),
    paymentMethod: row.payment_method ?? null,
    receiptPath: row.payment_receipt_path ?? null,
    notes: row.admin_notes ?? null,
    doctorId: row.promotions?.doctor_id ?? null,
    fixedAmount: true,
    sourceLabel: row.wants_appointment ? "Promocion con horario" : "Promocion pagada",
    row,
  }));

  const courseItems: PaymentsAndReservationsItem[] = courseRows.map((row) => ({
    id: row.id,
    kind: "course",
    createdAt: row.created_at,
    title: row.courses?.title ?? "Curso",
    customerName: row.full_name ?? "Alumno",
    phone: row.phone ?? null,
    email: row.email ?? null,
    city: row.city ?? row.courses?.city ?? null,
    statusLabel: row.status,
    statusGroup: toStatusGroup("course", row.status),
    amountExpected: Number(row.courses?.price ?? row.payment_amount ?? 0),
    amountPaid: Number(row.payment_amount ?? row.courses?.price ?? 0),
    paymentMethod: row.payment_method ?? null,
    receiptPath: row.payment_receipt_path ?? row.payment_receipt_url ?? null,
    notes: row.admin_notes ?? null,
    doctorId: null,
    fixedAmount: row.courses?.price != null,
    sourceLabel: "Inscripcion con pago",
    row,
  }));

  const bookItems: PaymentsAndReservationsItem[] = bookRows.map((row) => ({
    id: row.id,
    kind: "book",
    createdAt: row.created_at,
    title: row.books?.title ?? "Libro",
    customerName: row.full_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    city: row.city ?? null,
    statusLabel: row.status,
    statusGroup: toStatusGroup("book", row.status),
    amountExpected: Number(row.books?.price ?? row.payment_amount ?? 0),
    amountPaid: Number(row.payment_amount ?? row.books?.price ?? 0),
    paymentMethod: row.payment_method ?? null,
    receiptPath: row.payment_receipt_path ?? null,
    notes: row.admin_notes ?? null,
    doctorId: null,
    fixedAmount: row.books?.price != null,
    sourceLabel: "Libro pagado",
    row,
  }));

  const reservationItems: PaymentsAndReservationsItem[] = reservationRows
    .filter(isPaymentManagedReservation)
    .map((row) => {
      const source = (row.source ?? "").toLowerCase();
      const reservationCategory = source.includes("admin_manual")
        ? "manual"
        : source.includes("assessment") || source.includes("valoracion")
          ? "assessment"
          : "reservation";
      const sourceLabel =
        reservationCategory === "manual"
          ? "Cita manual"
          : reservationCategory === "assessment"
            ? "Valoracion pagada"
            : "Reserva con pago";

      return {
        id: row.id,
        kind: "reservation",
        reservationCategory,
        createdAt: row.created_at,
        title: row.title ?? row.appointment_type,
        customerName: row.patients?.full_name ?? "Paciente",
        phone: row.patients?.phone ?? null,
        email: row.patients?.email ?? null,
        city: row.city ?? row.patients?.city ?? null,
        statusLabel: row.status,
        statusGroup: toStatusGroup("reservation", row.status),
        amountExpected: Number(row.payment_amount ?? 0),
        amountPaid: Number(row.payment_amount ?? 0),
        paymentMethod: row.payment_method ?? null,
        receiptPath: row.payment_receipt_path ?? null,
        notes: row.admin_notes ?? null,
        doctorId: row.doctor_id ?? null,
        fixedAmount: (reservationCategory === "assessment" || reservationCategory === "manual") && Number(row.payment_amount ?? 0) > 0,
        sourceLabel,
        row,
      };
    });

  let items = [
    ...promotionItems,
    ...courseItems,
    ...bookItems,
    ...reservationItems,
  ];

  if (options?.role === "doctor") {
    const doctorId = options.doctorProfileId ?? null;
    items = items.filter((item) => {
      if (item.kind === "promotion" || item.kind === "reservation") {
        return doctorId ? item.doctorId === doctorId : false;
      }
      return false;
    });
  }

  if (shouldHidePatientPhone(options?.role)) {
    items = items.map((item) => ({ ...item, phone: null }));
  }

  return items.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}
