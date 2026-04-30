import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getMyAppointments } from "../../services/appointmentService";
import { getMyReservations } from "../../services/reservationService";
import { formatDate } from "../../utils/text";

export function PatientAppointmentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getMyAppointments>>>([]);
  const [reservations, setReservations] = useState<Awaited<ReturnType<typeof getMyReservations>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([getMyAppointments(user.id), getMyReservations(user.id)])
      .then(([nextItems, nextReservations]) => {
        setItems(nextItems);
        setReservations(nextReservations);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Cargando tus citas..." />;
  if (error) return <ErrorState label="No pudimos cargar tus citas." />;
  if (items.length === 0 && reservations.length === 0) return <EmptyState label="Todavía no tienes citas registradas." />;

  return (
    <div className="grid gap-4">
      {reservations.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Reserva inteligente</p>
              <h2 className="mt-2 text-lg font-semibold">{item.appointment_type}</h2>
            </div>
            <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
              {item.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
            {formatDate(item.appointment_date)} · {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
            <br />
            {item.city} {item.location ? `· ${item.location}` : ""}
          </p>
        </div>
      ))}
      {items.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
              {item.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
            {formatDate(item.appointment_date)} · {item.start_time}
            <br />
            {item.city} {item.location ? `· ${item.location}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
