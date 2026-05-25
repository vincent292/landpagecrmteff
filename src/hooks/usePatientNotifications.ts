import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabaseClient";
import { getEnrollmentById } from "../services/enrollmentService";
import { getPromotionOrderById } from "../services/promotionOrderService";
import { formatDate } from "../utils/text";

export type PatientNotification = {
  id: string;
  title: string;
  detail: string;
  href: string;
  module: "dashboard" | "citas" | "cursos" | "promociones" | "recetas" | "cuidados" | "descargas" | "libros";
  createdAt: string;
};

function getStorageKey(userId: string) {
  return `patient-notifications-last-seen:${userId}`;
}

function readLastSeen(userId: string) {
  if (typeof window === "undefined") return new Date(0).toISOString();
  return window.localStorage.getItem(getStorageKey(userId)) ?? new Date(0).toISOString();
}

function writeLastSeen(userId: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(userId), value);
}

function sortNotifications(items: PatientNotification[]) {
  return items
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20);
}

function getJoinedDoctorName(
  value: { full_name?: string | null } | { full_name?: string | null }[] | null | undefined
) {
  if (Array.isArray(value)) return value[0]?.full_name ?? null;
  return value?.full_name ?? null;
}

function getJoinedTitle(
  value: { title?: string | null } | { title?: string | null }[] | null | undefined
) {
  if (Array.isArray(value)) return value[0]?.title ?? null;
  return value?.title ?? null;
}

function scheduleDetail(date?: string | null, time?: string | null, doctor?: string | null) {
  const base = `${formatDate(date)}${time ? ` - ${time.slice(0, 5)}` : ""}`.trim();
  return doctor ? `${base}${base ? " - " : ""}${doctor}` : base;
}

function isManualReservationSource(source?: string | null) {
  return (source ?? "").toLowerCase().includes("admin_manual");
}

function buildAppointmentNotification(row: {
  id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  created_at: string;
  doctor_profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}): PatientNotification {
  return {
    id: `appointment-${row.id}`,
    title: "Nueva cita agendada",
    detail: `${row.title} - ${scheduleDetail(row.appointment_date, row.start_time, getJoinedDoctorName(row.doctor_profiles))}`,
    href: "/mi-panel/citas",
    module: "citas",
    createdAt: row.created_at,
  };
}

function buildReservationNotification(row: {
  id: string;
  appointment_type: string;
  appointment_date: string;
  start_time: string;
  status: string;
  source?: string | null;
  created_at: string;
  updated_at?: string | null;
  payment_verified_at?: string | null;
  admin_notes?: string | null;
  payment_receipt_path?: string | null;
  doctor_profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}): PatientNotification | null {
  const detail = `${row.appointment_type} - ${scheduleDetail(row.appointment_date, row.start_time, getJoinedDoctorName(row.doctor_profiles))}`;

  if (row.status === "Confirmada") {
    return {
      id: `reservation-confirmed-${row.id}`,
      title: "Pago aprobado de tu cita",
      detail,
      href: "/mi-panel/citas",
      module: "citas",
      createdAt: row.payment_verified_at ?? row.updated_at ?? row.created_at,
    };
  }

  if (row.status === "Rechazada") {
    return {
      id: `reservation-rejected-${row.id}`,
      title: "Pago rechazado de tu cita",
      detail: row.admin_notes?.trim() ? `${detail} - ${row.admin_notes.trim()}` : detail,
      href: "/mi-panel/citas",
      module: "citas",
      createdAt: row.updated_at ?? row.created_at,
    };
  }

  if (isManualReservationSource(row.source) && !row.payment_receipt_path) {
    return {
      id: `reservation-manual-${row.id}`,
      title: "Nueva cita pendiente de pago",
      detail,
      href: "/mi-panel/citas",
      module: "citas",
      createdAt: row.created_at,
    };
  }

  return null;
}

function buildPrescriptionNotification(row: { id: string; title: string; created_at: string }) {
  return {
    id: `prescription-${row.id}`,
    title: "Nueva receta disponible",
    detail: row.title,
    href: "/mi-panel/recetas",
    module: "recetas" as const,
    createdAt: row.created_at,
  };
}

function buildCareNotification(row: { id: string; title: string; created_at: string }) {
  return {
    id: `care-${row.id}`,
    title: "Nuevo cuidado disponible",
    detail: row.title,
    href: "/mi-panel/cuidados",
    module: "cuidados" as const,
    createdAt: row.created_at,
  };
}

function buildCourseNotification(row: {
  id: string;
  status: string;
  created_at: string;
  admin_notes?: string | null;
  courses?: { title?: string | null } | { title?: string | null }[] | null;
}) {
  if (row.status === "Confirmado") {
    return {
      id: `course-confirmed-${row.id}`,
      title: "Inscripcion confirmada",
      detail: getJoinedTitle(row.courses) ?? "Curso",
      href: "/mi-panel/cursos",
      module: "cursos" as const,
      createdAt: row.created_at,
    };
  }

  if (row.status === "Rechazado") {
    return {
      id: `course-rejected-${row.id}`,
      title: "Inscripcion rechazada",
      detail: row.admin_notes?.trim() ? `${getJoinedTitle(row.courses) ?? "Curso"} - ${row.admin_notes.trim()}` : getJoinedTitle(row.courses) ?? "Curso",
      href: "/mi-panel/cursos",
      module: "cursos" as const,
      createdAt: row.created_at,
    };
  }

  return null;
}

function buildPromotionNotification(row: {
  id: string;
  status: string;
  updated_at: string;
  admin_notes?: string | null;
  promotions?: { title?: string | null } | { title?: string | null }[] | null;
}) {
  if (row.status === "Aprobado") {
    return {
      id: `promotion-approved-${row.id}`,
      title: "Promocion aprobada",
      detail: getJoinedTitle(row.promotions) ?? "Promocion",
      href: "/mi-panel/promociones",
      module: "promociones" as const,
      createdAt: row.updated_at,
    };
  }

  if (row.status === "Rechazado") {
    return {
      id: `promotion-rejected-${row.id}`,
      title: "Promocion rechazada",
      detail: row.admin_notes?.trim() ? `${getJoinedTitle(row.promotions) ?? "Promocion"} - ${row.admin_notes.trim()}` : getJoinedTitle(row.promotions) ?? "Promocion",
      href: "/mi-panel/promociones",
      module: "promociones" as const,
      createdAt: row.updated_at,
    };
  }

  return null;
}

function buildDownloadNotification(row: {
  id: string;
  created_at: string;
  books?: { title?: string | null } | { title?: string | null }[] | null;
}) {
  return {
    id: `download-${row.id}`,
    title: "Descarga habilitada",
    detail: getJoinedTitle(row.books) ?? "Libro disponible",
    href: "/mi-panel/descargas",
    module: "descargas" as const,
    createdAt: row.created_at,
  };
}

function buildBookRejectedNotification(row: {
  id: string;
  created_at: string;
  admin_notes?: string | null;
  books?: { title?: string | null } | { title?: string | null }[] | null;
}) {
  return {
    id: `book-rejected-${row.id}`,
    title: "Pedido de libro rechazado",
    detail: row.admin_notes?.trim() ? `${getJoinedTitle(row.books) ?? "Libro"} - ${row.admin_notes.trim()}` : getJoinedTitle(row.books) ?? "Libro",
    href: "/mi-panel/libros",
    module: "libros" as const,
    createdAt: row.created_at,
  };
}

export function usePatientNotifications(userId?: string | null) {
  const [items, setItems] = useState<PatientNotification[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string>(new Date(0).toISOString());
  const [patientId, setPatientId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLastSeenAt(readLastSeen(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setPatientId(null);
      return;
    }

    let active = true;

    void supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .eq("is_deleted", false)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setPatientId(data?.id ?? null);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    async function loadInitialNotifications() {
      const [
        appointmentsResult,
        reservationsResult,
        prescriptionsResult,
        caresResult,
        coursesResult,
        promotionsResult,
        tokensResult,
        rejectedBooksResult,
      ] = await Promise.all([
        !patientId
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("appointments")
              .select("id, title, appointment_date, start_time, created_at, doctor_profiles(full_name)")
              .eq("patient_id", patientId)
              .eq("is_deleted", false)
              .order("created_at", { ascending: false })
              .limit(6),
        supabase
          .from("appointment_reservations")
          .select("id, appointment_type, appointment_date, start_time, status, source, created_at, updated_at, payment_verified_at, admin_notes, payment_receipt_path, doctor_profiles(full_name)")
          .eq("user_id", userId)
          .eq("is_deleted", false)
          .order("updated_at", { ascending: false })
          .limit(8),
        !patientId
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("patient_prescriptions")
              .select("id, title, created_at")
              .eq("patient_id", patientId)
              .eq("is_visible_to_patient", true)
              .eq("is_deleted", false)
              .order("created_at", { ascending: false })
              .limit(6),
        !patientId
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("post_treatment_cares")
              .select("id, title, created_at")
              .eq("patient_id", patientId)
              .eq("is_visible_to_patient", true)
              .eq("is_deleted", false)
              .order("created_at", { ascending: false })
              .limit(6),
        supabase
          .from("course_enrollments")
          .select("id, status, created_at, admin_notes, courses(title)")
          .eq("user_id", userId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("promotion_orders")
          .select("id, status, updated_at, admin_notes, promotions(title)")
          .eq("user_id", userId)
          .eq("is_deleted", false)
          .order("updated_at", { ascending: false })
          .limit(6),
        supabase
          .from("book_download_tokens")
          .select("id, created_at, books(title)")
          .eq("user_id", userId)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("book_orders")
          .select("id, status, created_at, admin_notes, books(title)")
          .eq("user_id", userId)
          .eq("is_deleted", false)
          .eq("status", "Rechazado")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      if (!active) return;

      const notifications: PatientNotification[] = [
        ...(appointmentsResult.data ?? []).map((row) => buildAppointmentNotification(row)),
        ...(reservationsResult.data ?? [])
          .map((row) => buildReservationNotification(row))
          .filter(Boolean) as PatientNotification[],
        ...(prescriptionsResult.data ?? []).map((row) => buildPrescriptionNotification(row)),
        ...(caresResult.data ?? []).map((row) => buildCareNotification(row)),
        ...(coursesResult.data ?? [])
          .map((row) => buildCourseNotification(row))
          .filter(Boolean) as PatientNotification[],
        ...(promotionsResult.data ?? [])
          .map((row) => buildPromotionNotification(row))
          .filter(Boolean) as PatientNotification[],
        ...(tokensResult.data ?? []).map((row) => buildDownloadNotification(row)),
        ...(rejectedBooksResult.data ?? []).map((row) => buildBookRejectedNotification(row)),
      ];

      setItems(sortNotifications(notifications));
    }

    void loadInitialNotifications();

    return () => {
      active = false;
    };
  }, [patientId, userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    const prepend = (notification: PatientNotification | null) => {
      if (!notification) return;
      setItems((current) => sortNotifications([notification, ...current.filter((item) => item.id !== notification.id)]));
    };

    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    if (patientId) {
      channels.push(
        supabase
          .channel(`patient-appointments:${userId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "appointments", filter: `patient_id=eq.${patientId}` },
            async (payload) => {
              if (!active) return;
              const { data } = await supabase
                .from("appointments")
                .select("id, title, appointment_date, start_time, created_at, doctor_profiles(full_name)")
                .eq("id", payload.new.id)
                .eq("is_deleted", false)
                .maybeSingle();
              if (!data) return;
              prepend(buildAppointmentNotification(data));
            }
          )
          .subscribe()
      );
    }

    channels.push(
      supabase
        .channel(`patient-reservations:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "appointment_reservations", filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!active) return;
            const { data } = await supabase
              .from("appointment_reservations")
              .select("id, appointment_type, appointment_date, start_time, status, source, created_at, updated_at, payment_verified_at, admin_notes, payment_receipt_path, doctor_profiles(full_name)")
              .eq("id", payload.new.id)
              .eq("is_deleted", false)
              .maybeSingle();
            if (!data) return;
            prepend(buildReservationNotification(data));
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "appointment_reservations", filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!active) return;
            if (payload.old.status === payload.new.status && payload.old.payment_receipt_path === payload.new.payment_receipt_path) return;
            const { data } = await supabase
              .from("appointment_reservations")
              .select("id, appointment_type, appointment_date, start_time, status, source, created_at, updated_at, payment_verified_at, admin_notes, payment_receipt_path, doctor_profiles(full_name)")
              .eq("id", payload.new.id)
              .eq("is_deleted", false)
              .maybeSingle();
            if (!data) return;
            prepend(buildReservationNotification(data));
          }
        )
        .subscribe()
    );

    if (patientId) {
      channels.push(
        supabase
          .channel(`patient-prescriptions:${userId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "patient_prescriptions", filter: `patient_id=eq.${patientId}` },
            (payload) => {
              if (!active || !payload.new.is_visible_to_patient) return;
              prepend(
                buildPrescriptionNotification({
                  id: payload.new.id,
                  title: payload.new.title,
                  created_at: payload.new.created_at,
                })
              );
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "patient_prescriptions", filter: `patient_id=eq.${patientId}` },
            (payload) => {
              if (!active || payload.old.is_visible_to_patient || !payload.new.is_visible_to_patient) return;
              prepend(
                buildPrescriptionNotification({
                  id: payload.new.id,
                  title: payload.new.title,
                  created_at: payload.new.created_at ?? new Date().toISOString(),
                })
              );
            }
          )
          .subscribe()
      );

      channels.push(
        supabase
          .channel(`patient-cares:${userId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "post_treatment_cares", filter: `patient_id=eq.${patientId}` },
            (payload) => {
              if (!active || !payload.new.is_visible_to_patient) return;
              prepend(
                buildCareNotification({
                  id: payload.new.id,
                  title: payload.new.title,
                  created_at: payload.new.created_at,
                })
              );
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "post_treatment_cares", filter: `patient_id=eq.${patientId}` },
            (payload) => {
              if (!active || payload.old.is_visible_to_patient || !payload.new.is_visible_to_patient) return;
              prepend(
                buildCareNotification({
                  id: payload.new.id,
                  title: payload.new.title,
                  created_at: payload.new.created_at ?? new Date().toISOString(),
                })
              );
            }
          )
          .subscribe()
      );
    }

    channels.push(
      supabase
        .channel(`patient-courses:${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "course_enrollments", filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!active || payload.old.status === payload.new.status) return;
            const row = await getEnrollmentById(payload.new.id).catch(() => null);
            if (!row) return;
            prepend(buildCourseNotification(row));
          }
        )
        .subscribe()
    );

    channels.push(
      supabase
        .channel(`patient-promotions:${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "promotion_orders", filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!active || payload.old.status === payload.new.status) return;
            const row = await getPromotionOrderById(payload.new.id).catch(() => null);
            if (!row) return;
            prepend(buildPromotionNotification(row));
          }
        )
        .subscribe()
    );

    channels.push(
      supabase
        .channel(`patient-downloads:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "book_download_tokens", filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!active) return;
            const { data } = await supabase
              .from("book_download_tokens")
              .select("id, created_at, books(title)")
              .eq("id", payload.new.id)
              .maybeSingle();
            if (!data) return;
            prepend(buildDownloadNotification(data));
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "book_orders", filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!active || payload.new.status !== "Rechazado" || payload.old.status === "Rechazado") return;
            const { data } = await supabase
              .from("book_orders")
              .select("id, status, created_at, admin_notes, books(title)")
              .eq("id", payload.new.id)
              .maybeSingle();
            if (!data) return;
            prepend(buildBookRejectedNotification(data));
          }
        )
        .subscribe()
    );

    return () => {
      active = false;
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [patientId, userId]);

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
