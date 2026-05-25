import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabaseClient";
import type { UserRole } from "../types/platform";
import { getVisibleDeletionFilter } from "../services/adminDeletionService";
import { getBookOrdersAdmin } from "../services/bookOrderService";
import { getEnrollmentById } from "../services/enrollmentService";
import { isPaymentManagedReservation } from "../services/paymentsAndReservationsService";
import { getPromotionOrderById } from "../services/promotionOrderService";
import { getInformationRequestById } from "../services/requestService";
import { getReservationById } from "../services/reservationService";

export type AdminNotification = {
  id: string;
  entityId: string;
  type: "request" | "enrollment" | "reservation" | "promotion_order" | "book_order" | "appointment";
  title: string;
  detail: string;
  href: string;
  module: "solicitudes" | "pagos-reservas" | "citas";
  createdAt: string;
};

function getStorageKey(userId: string) {
  return `admin-notifications-last-seen:${userId}`;
}

function readLastSeen(userId: string) {
  if (typeof window === "undefined") return new Date(0).toISOString();
  return window.localStorage.getItem(getStorageKey(userId)) ?? new Date(0).toISOString();
}

function writeLastSeen(userId: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(userId), value);
}

function sortNotifications(items: AdminNotification[]) {
  return items
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20);
}

function getJoinedTitle(value: { title?: string | null; doctor_id?: string | null } | { title?: string | null; doctor_id?: string | null }[] | null | undefined) {
  if (Array.isArray(value)) return value[0]?.title ?? null;
  return value?.title ?? null;
}

function getJoinedFullName(
  value: { full_name?: string | null } | { full_name?: string | null }[] | null | undefined
) {
  if (Array.isArray(value)) return value[0]?.full_name ?? null;
  return value?.full_name ?? null;
}

function isManualReservationSource(source?: string | null) {
  return (source ?? "").toLowerCase().includes("admin_manual");
}

function buildDoctorAppointmentNotification(row: {
  id: string;
  title?: string | null;
  appointment_date?: string | null;
  start_time?: string | null;
  created_at: string;
  patients?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}): AdminNotification {
  const patientName = getJoinedFullName(row.patients) ?? "Paciente";
  const appointmentTitle = row.title ?? "Cita manual";
  const schedule = row.appointment_date && row.start_time ? ` · ${row.appointment_date} ${row.start_time.slice(0, 5)}` : "";

  return {
    id: `appointment-${row.id}`,
    entityId: row.id,
    type: "appointment",
    title: "Nueva cita manual asignada",
    detail: `${patientName} · ${appointmentTitle}${schedule}`,
    href: "/panel/citas",
    module: "citas",
    createdAt: row.created_at,
  };
}

function buildDoctorManualReservationNotification(row: {
  id: string;
  appointment_type: string;
  created_at: string;
  appointment_date?: string | null;
  start_time?: string | null;
  patients?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}): AdminNotification {
  const patientName = getJoinedFullName(row.patients) ?? "Paciente";
  const schedule = row.appointment_date && row.start_time ? ` · ${row.appointment_date} ${row.start_time.slice(0, 5)}` : "";

  return {
    id: `reservation-manual-${row.id}`,
    entityId: row.id,
    type: "reservation",
    title: "Nueva cita manual asignada",
    detail: `${patientName} · ${row.appointment_type}${schedule}`,
    href: "/panel/citas",
    module: "citas",
    createdAt: row.created_at,
  };
}

function buildDoctorConfirmedReservationNotification(row: {
  id: string;
  appointment_type: string;
  payment_verified_at?: string | null;
  patients?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}): AdminNotification | null {
  if (!row.payment_verified_at) return null;
  const patientName = getJoinedFullName(row.patients) ?? "Paciente";

  return {
    id: `reservation-paid-${row.id}`,
    entityId: row.id,
    type: "reservation",
    title: "Pago confirmado de cita",
    detail: `${patientName} · ${row.appointment_type}`,
    href: "/panel/citas",
    module: "citas",
    createdAt: row.payment_verified_at,
  };
}

export function useAdminNotifications(userId?: string | null, role?: UserRole) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string>(new Date(0).toISOString());
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLastSeenAt(readLastSeen(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId || role !== "doctor") {
      setDoctorProfileId(null);
      return;
    }

    let active = true;

    void supabase
      .from("doctor_profiles")
      .select("id")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setDoctorProfileId(data?.id ?? null);
      });

    return () => {
      active = false;
    };
  }, [role, userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    async function loadInitialNotifications() {
      const enrollmentsFilter = getVisibleDeletionFilter("course_enrollments", false);
      const promotionOrdersFilter = getVisibleDeletionFilter("promotion_orders", false);

      const [requestsResult, enrollmentsResult, promotionOrdersResult, reservationsResult, bookOrders, doctorAppointmentsResult] = await Promise.all([
        supabase
          .from("information_requests")
          .select("id, full_name, interest_title, interest_type, created_at")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
        (() => {
          let query = supabase
            .from("course_enrollments")
            .select("id, full_name, created_at, courses(title)")
            .order("created_at", { ascending: false })
            .limit(6);
          if (enrollmentsFilter.column) query = query.eq(enrollmentsFilter.column, enrollmentsFilter.value);
          return query;
        })(),
        (() => {
          let query = supabase
            .from("promotion_orders")
            .select("id, full_name, created_at, promotions(title, doctor_id)")
            .order("created_at", { ascending: false })
            .limit(6);
          if (promotionOrdersFilter.column) query = query.eq(promotionOrdersFilter.column, promotionOrdersFilter.value);
          return query;
        })(),
        (() => {
          let query = supabase
            .from("appointment_reservations")
            .select("id, appointment_type, title, source, payment_receipt_path, payment_amount, payment_expires_at, doctor_id, status, created_at, payment_verified_at, appointment_date, start_time, patients(full_name)")
            .eq("is_deleted", false)
            .order(role === "doctor" ? "payment_verified_at" : "created_at", { ascending: false })
            .limit(6);
          if (role === "doctor" && doctorProfileId) query = query.eq("doctor_id", doctorProfileId);
          return query;
        })(),
        role === "doctor" ? Promise.resolve([]) : getBookOrdersAdmin().catch(() => []),
        role !== "doctor" || !doctorProfileId
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("appointments")
              .select("id, title, appointment_date, start_time, doctor_id, created_at, patients(full_name)")
              .eq("is_deleted", false)
              .eq("doctor_id", doctorProfileId)
              .order("created_at", { ascending: false })
              .limit(6),
      ]);

      if (!active) return;

      const notifications: AdminNotification[] = [
        ...(role === "doctor"
          ? []
          : (requestsResult.data ?? []).map((row) => ({
              id: `request-${row.id}`,
              entityId: row.id,
              type: "request" as const,
              title: "Nueva solicitud",
              detail: `${row.full_name} · ${row.interest_title ?? row.interest_type ?? "General"}`,
              href: "/panel/solicitudes",
              module: "solicitudes" as const,
              createdAt: row.created_at,
            }))),
        ...(role === "doctor"
          ? []
          : (enrollmentsResult.data ?? []).map((row) => ({
              id: `enrollment-${row.id}`,
              entityId: row.id,
              type: "enrollment" as const,
              title: "Nueva inscripcion",
              detail: `${row.full_name ?? "Alumno"} · ${getJoinedTitle(row.courses) ?? "Curso"}`,
              href: "/panel/pagos-reservas",
              module: "pagos-reservas" as const,
              createdAt: row.created_at,
            }))),
        ...(promotionOrdersResult.data ?? [])
          .filter(() => role !== "doctor")
          .map((row) => ({
            id: `promotion-order-${row.id}`,
            entityId: row.id,
            type: "promotion_order" as const,
            title: "Nuevo pago de promocion",
            detail: `${row.full_name} · ${getJoinedTitle(row.promotions) ?? "Promocion"}`,
            href: "/panel/pagos-reservas",
            module: "pagos-reservas" as const,
            createdAt: row.created_at,
          })),
        ...bookOrders.map((row) => ({
          id: `book-order-${row.id}`,
          entityId: row.id,
          type: "book_order" as const,
          title: "Nuevo pedido con comprobante",
          detail: `${row.full_name} · ${row.books?.title ?? "Libro"}`,
          href: "/panel/pagos-reservas",
          module: "pagos-reservas" as const,
          createdAt: row.created_at,
        })),
        ...(reservationsResult.data ?? [])
          .filter((row) => isPaymentManagedReservation(row))
          .filter(() => role !== "doctor")
          .map((row) => ({
            id: `reservation-${row.id}`,
            entityId: row.id,
            type: "reservation" as const,
            title: "Nueva reserva con pago",
            detail: `${getJoinedFullName(row.patients) ?? "Paciente"} · ${row.appointment_type}`,
            href: "/panel/pagos-reservas",
            module: "pagos-reservas" as const,
            createdAt: row.created_at,
          })),
        ...(role !== "doctor"
          ? []
          : (doctorAppointmentsResult.data ?? []).map((row) => buildDoctorAppointmentNotification(row))),
        ...(role !== "doctor"
          ? []
          : (reservationsResult.data ?? [])
              .filter((row) => row.doctor_id === doctorProfileId)
              .flatMap((row) => {
                const doctorNotifications: AdminNotification[] = [];
                if (isManualReservationSource(row.source)) {
                  doctorNotifications.push(buildDoctorManualReservationNotification(row));
                }
                const confirmedNotification = row.status === "Confirmada" ? buildDoctorConfirmedReservationNotification(row) : null;
                if (confirmedNotification) doctorNotifications.push(confirmedNotification);
                return doctorNotifications;
              })),
      ];

      setItems(sortNotifications(notifications));
    }

    void loadInitialNotifications();

    return () => {
      active = false;
    };
  }, [doctorProfileId, role, userId]);

  useEffect(() => {
    if (!userId || role === "doctor") return;

    let active = true;

    const prepend = (notification: AdminNotification) => {
      setItems((current) => {
        const next = [notification, ...current.filter((item) => item.id !== notification.id)];
        return sortNotifications(next);
      });
    };

    const channel = supabase
      .channel(`admin-live-notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "information_requests" },
        async (payload) => {
          if (!active) return;
          const row = await getInformationRequestById(payload.new.id).catch(() => null);
          if (!row) return;
          prepend({
            id: `request-${row.id}`,
            entityId: row.id,
            type: "request",
            title: "Nueva solicitud",
            detail: `${row.full_name} · ${row.interest_title ?? row.interest_type ?? "General"}`,
            href: "/panel/solicitudes",
            module: "solicitudes",
            createdAt: row.created_at,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "course_enrollments" },
        async (payload) => {
          if (!active) return;
          const row = await getEnrollmentById(payload.new.id).catch(() => null);
          if (!row) return;
          prepend({
            id: `enrollment-${row.id}`,
            entityId: row.id,
            type: "enrollment",
            title: "Nueva inscripcion",
            detail: `${row.full_name ?? "Alumno"} · ${row.courses?.title ?? "Curso"}`,
            href: "/panel/pagos-reservas",
            module: "pagos-reservas",
            createdAt: row.created_at,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "promotion_orders" },
        async (payload) => {
          if (!active) return;
          const row = await getPromotionOrderById(payload.new.id).catch(() => null);
          if (!row) return;
          prepend({
            id: `promotion-order-${row.id}`,
            entityId: row.id,
            type: "promotion_order",
            title: "Nuevo pago de promocion",
            detail: `${row.full_name} · ${row.promotions?.title ?? "Promocion"}`,
            href: "/panel/pagos-reservas",
            module: "pagos-reservas",
            createdAt: row.created_at,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "book_orders" },
        async (payload) => {
          if (!active) return;
          const rows = await getBookOrdersAdmin().catch(() => []);
          const row = rows.find((item) => item.id === payload.new.id);
          if (!row) return;
          prepend({
            id: `book-order-${row.id}`,
            entityId: row.id,
            type: "book_order",
            title: "Nuevo pedido con comprobante",
            detail: `${row.full_name} · ${row.books?.title ?? "Libro"}`,
            href: "/panel/pagos-reservas",
            module: "pagos-reservas",
            createdAt: row.created_at,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointment_reservations" },
        async (payload) => {
          if (!active) return;
          const row = await getReservationById(payload.new.id).catch(() => null);
          if (!row || !isPaymentManagedReservation(row)) return;
          prepend({
            id: `reservation-${row.id}`,
            entityId: row.id,
            type: "reservation",
            title: "Nueva reserva con pago",
            detail: `${row.patients?.full_name ?? "Paciente"} · ${row.appointment_type}`,
            href: "/panel/pagos-reservas",
            module: "pagos-reservas",
            createdAt: row.created_at,
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [doctorProfileId, role, userId]);

  useEffect(() => {
    if (!userId || role !== "doctor" || !doctorProfileId) return;

    let active = true;

    const prepend = (notification: AdminNotification | null) => {
      if (!notification) return;
      setItems((current) => {
        const next = [notification, ...current.filter((item) => item.id !== notification.id)];
        return sortNotifications(next);
      });
    };

    const channel = supabase
      .channel(`doctor-live-notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        async (payload) => {
          if (!active || payload.new.doctor_id !== doctorProfileId) return;

          const { data } = await supabase
            .from("appointments")
            .select("id, title, appointment_date, start_time, created_at, patients(full_name)")
            .eq("id", payload.new.id)
            .eq("is_deleted", false)
            .maybeSingle();

          if (!data) return;
          prepend(buildDoctorAppointmentNotification(data));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointment_reservations" },
        async (payload) => {
          if (!active || payload.new.doctor_id !== doctorProfileId || !isManualReservationSource(payload.new.source)) return;
          const row = await getReservationById(payload.new.id).catch(() => null);
          if (!row) return;
          prepend(buildDoctorManualReservationNotification(row));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointment_reservations" },
        async (payload) => {
          if (!active || payload.new.doctor_id !== doctorProfileId) return;
          if (payload.old.status === "Confirmada" || payload.new.status !== "Confirmada") return;
          const row = await getReservationById(payload.new.id).catch(() => null);
          if (!row) return;
          prepend(buildDoctorConfirmedReservationNotification(row));
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [doctorProfileId, role, userId]);

  const unreadCount = useMemo(
    () => items.filter((item) => new Date(item.createdAt).getTime() > new Date(lastSeenAt).getTime()).length,
    [items, lastSeenAt]
  );

  const unreadByModule = useMemo(
    () =>
      items.reduce<Record<string, number>>((accumulator, item) => {
        if (new Date(item.createdAt).getTime() <= new Date(lastSeenAt).getTime()) return accumulator;
        accumulator[item.module] = (accumulator[item.module] ?? 0) + 1;
        return accumulator;
      }, {}),
    [items, lastSeenAt]
  );

  const markAllAsSeen = () => {
    if (!userId) return;
    const next = new Date().toISOString();
    setLastSeenAt(next);
    writeLastSeen(userId, next);
  };

  return {
    items,
    unreadCount,
    unreadByModule,
    markAllAsSeen,
  };
}
