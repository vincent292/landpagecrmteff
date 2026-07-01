import type { UserRole } from "../types/platform";
import { getInformationRequests, type InformationRequestRow } from "./requestService";
import { getPaymentsAndReservationsFeed } from "./paymentsAndReservationsService";
import { getReservationsAdmin, type AppointmentReservationRow } from "./reservationService";
import { getServiceFeedback, type ServiceFeedbackRow } from "./feedbackService";
import { supabase } from "../lib/supabaseClient";

export type OperationalPeriod = {
  from: string;
  to: string;
};

export type OperationalEventType =
  | "appointment"
  | "treatment"
  | "promotion"
  | "request"
  | "feedback";

export type OperationalEvent = {
  id: string;
  type: OperationalEventType;
  date: string;
  title: string;
  patientName: string | null;
  city: string | null;
  status: string;
  amount: number;
  rating: number | null;
  source: string;
  notes: string | null;
};

export type ClinicalEvolutionReportRow = {
  id: string;
  title: string | null;
  treatment_performed: string | null;
  description: string | null;
  created_at: string;
  patients?: {
    full_name: string | null;
    city: string | null;
  } | { full_name: string | null; city: string | null }[] | null;
};

export async function getOperationalReportData(options?: {
  role?: UserRole;
  doctorProfileId?: string | null;
}) {
  const [feed, reservations, requests, evolutions, feedback] = await Promise.all([
    getPaymentsAndReservationsFeed({
      role: options?.role,
      doctorProfileId: options?.doctorProfileId ?? null,
    }),
    getReservationsAdmin({}, false, options?.role),
    getInformationRequests(),
    getClinicalEvolutionReportRows(),
    getServiceFeedback().catch(() => [] as ServiceFeedbackRow[]),
  ]);

  const paymentEvents: OperationalEvent[] = feed.map((item) => ({
    id: `${item.kind}-${item.id}`,
    type: item.kind === "promotion" ? "promotion" : item.kind === "reservation" ? classifyReservationType(item.row) : "request",
    date: item.createdAt,
    title: item.title,
    patientName: item.customerName,
    city: item.city,
    status: item.statusLabel,
    amount: item.amountPaid || item.amountExpected,
    rating: null,
    source: item.sourceLabel,
    notes: item.notes,
  }));

  const appointmentEvents: OperationalEvent[] = reservations
    .filter((row) => !feed.some((item) => item.kind === "reservation" && item.id === row.id))
    .map((row) => ({
      id: `appointment-${row.id}`,
      type: classifyReservationType(row),
      date: row.appointment_date,
      title: row.title ?? row.appointment_type,
      patientName: row.patients?.full_name ?? null,
      city: row.city ?? row.patients?.city ?? null,
      status: row.status,
      amount: Number(row.payment_amount ?? 0),
      rating: null,
      source: "Cita",
      notes: row.notes ?? row.admin_notes ?? null,
    }));

  const requestEvents: OperationalEvent[] = requests.map((row: InformationRequestRow) => ({
    id: `request-${row.id}`,
    type: "request",
    date: row.created_at,
    title: row.interest_title ?? row.interest_type ?? "Solicitud",
    patientName: row.full_name ?? null,
    city: row.city ?? null,
    status: row.status ?? "Nuevo",
    amount: 0,
    rating: null,
    source: row.interest_type ?? "Solicitud",
    notes: row.message ?? row.internal_notes ?? null,
  }));

  const treatmentEvents: OperationalEvent[] = evolutions.map((row) => ({
    id: `evolution-${row.id}`,
    type: "treatment",
    date: row.created_at,
    title: row.treatment_performed ?? row.title ?? "Procedimiento realizado",
    patientName: getEvolutionPatient(row)?.full_name ?? null,
    city: getEvolutionPatient(row)?.city ?? null,
    status: "Realizado",
    amount: 0,
    rating: null,
    source: "Historia clinica",
    notes: row.description ?? null,
  }));

  const feedbackEvents: OperationalEvent[] = feedback.map((row) => ({
    id: `feedback-${row.id}`,
    type: "feedback",
    date: row.created_at,
    title: row.treatment_name ?? row.context_title ?? "Calificacion de atencion",
    patientName: row.patient_name ?? null,
    city: row.city ?? null,
    status: row.would_recommend == null ? "Respondido" : row.would_recommend ? "Recomienda" : "No recomienda",
    amount: 0,
    rating: row.rating,
    source: getFeedbackSource(row),
    notes: row.comments ?? null,
  }));

  return [...paymentEvents, ...appointmentEvents, ...requestEvents, ...treatmentEvents, ...feedbackEvents].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  );
}

async function getClinicalEvolutionReportRows() {
  const { data, error } = await supabase
    .from("clinical_evolutions")
    .select("id, title, treatment_performed, description, created_at, patients(full_name, city)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ClinicalEvolutionReportRow[];
}

function classifyReservationType(row: AppointmentReservationRow): OperationalEventType {
  const text = `${row.source ?? ""} ${row.title ?? ""} ${row.appointment_type ?? ""}`.toLowerCase();
  if (text.includes("promocion") || text.includes("promotion")) return "promotion";
  if (text.includes("treatment") || text.includes("tratamiento")) return "treatment";
  return "appointment";
}

function getFeedbackSource(row: ServiceFeedbackRow) {
  if (row.context_type === "promotion") return "Calificacion promocion";
  if (row.context_type === "treatment") return "Calificacion tratamiento";
  if (row.context_type === "appointment") return "Calificacion cita";
  return "Calificacion";
}

function getEvolutionPatient(row: ClinicalEvolutionReportRow) {
  return Array.isArray(row.patients) ? row.patients[0] ?? null : row.patients ?? null;
}
