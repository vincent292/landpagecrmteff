import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabaseClient";
import { getEnrollmentById } from "../services/enrollmentService";
import { getPromotionOrderById } from "../services/promotionOrderService";
import { getInformationRequestById } from "../services/requestService";
import { getReservationById } from "../services/reservationService";

export type AdminNotification = {
  id: string;
  entityId: string;
  type: "request" | "enrollment" | "reservation" | "promotion_order";
  title: string;
  detail: string;
  href: string;
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

function getJoinedTitle(value: { title?: string | null } | { title?: string | null }[] | null | undefined) {
  if (Array.isArray(value)) return value[0]?.title ?? null;
  return value?.title ?? null;
}

function getJoinedFullName(value: { full_name?: string | null } | { full_name?: string | null }[] | null | undefined) {
  if (Array.isArray(value)) return value[0]?.full_name ?? null;
  return value?.full_name ?? null;
}

export function useAdminNotifications(userId?: string | null) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string>(new Date(0).toISOString());

  useEffect(() => {
    if (!userId) return;
    const nextLastSeen = readLastSeen(userId);
    setLastSeenAt(nextLastSeen);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    async function loadInitialNotifications() {
      const [requestsResult, enrollmentsResult, promotionOrdersResult, reservationsResult] = await Promise.all([
        supabase
          .from("information_requests")
          .select("id, full_name, interest_title, interest_type, created_at")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("course_enrollments")
          .select("id, full_name, created_at, courses(title)")
          .eq("deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("promotion_orders")
          .select("id, full_name, created_at, promotions(title)")
          .eq("deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("appointment_reservations")
          .select("id, appointment_type, created_at, patients(full_name)")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (!active) return;

      const notifications: AdminNotification[] = [
        ...((requestsResult.data ?? []).map((row) => ({
          id: `request-${row.id}`,
          entityId: row.id,
          type: "request" as const,
          title: "Nueva solicitud",
          detail: `${row.full_name} · ${row.interest_title ?? row.interest_type ?? "General"}`,
          href: "/panel/solicitudes",
          createdAt: row.created_at,
        }))),
        ...((enrollmentsResult.data ?? []).map((row) => ({
          id: `enrollment-${row.id}`,
          entityId: row.id,
          type: "enrollment" as const,
          title: "Nueva inscripcion",
          detail: `${row.full_name ?? "Alumno"} · ${getJoinedTitle(row.courses) ?? "Curso"}`,
          href: "/panel/inscripciones",
          createdAt: row.created_at,
        }))),
        ...((promotionOrdersResult.data ?? []).map((row) => ({
          id: `promotion-order-${row.id}`,
          entityId: row.id,
          type: "promotion_order" as const,
          title: "Nueva solicitud de promocion",
          detail: `${row.full_name} · ${getJoinedTitle(row.promotions) ?? "Promocion"}`,
          href: "/panel/pedidos-promociones",
          createdAt: row.created_at,
        }))),
        ...((reservationsResult.data ?? []).map((row) => ({
          id: `reservation-${row.id}`,
          entityId: row.id,
          type: "reservation" as const,
          title: "Nueva cita solicitada",
          detail: `${getJoinedFullName(row.patients) ?? "Paciente"} · ${row.appointment_type}`,
          href: "/panel/citas",
          createdAt: row.created_at,
        }))),
      ];

      setItems(sortNotifications(notifications));
    }

    void loadInitialNotifications();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

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
            title: "Nueva inscripción",
            detail: `${row.full_name ?? "Alumno"} · ${row.courses?.title ?? "Curso"}`,
            href: "/panel/inscripciones",
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
            title: "Nueva solicitud de promocion",
            detail: `${row.full_name} · ${row.promotions?.title ?? "Promocion"}`,
            href: "/panel/pedidos-promociones",
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
          if (!row) return;
          prepend({
            id: `reservation-${row.id}`,
            entityId: row.id,
            type: "reservation",
            title: "Nueva cita solicitada",
            detail: `${row.patients?.full_name ?? "Paciente"} · ${row.appointment_type}`,
            href: "/panel/citas",
            createdAt: row.created_at,
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = useMemo(
    () => items.filter((item) => new Date(item.createdAt).getTime() > new Date(lastSeenAt).getTime()).length,
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
    markAllAsSeen,
  };
}
