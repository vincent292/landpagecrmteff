import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getAppointmentsByPatient } from "../../services/appointmentService";
import { getMyBookOrders } from "../../services/bookOrderService";
import { getMyActiveBooks } from "../../services/bookPortalService";
import { getPatientByProfileId } from "../../services/patientService";
import { getMyPostCares } from "../../services/postCareService";
import { getMyPrescriptions } from "../../services/prescriptionService";
import { formatDate } from "../../utils/text";

export function PatientDashboardPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [summary, setSummary] = useState({
    nextAppointment: null as Awaited<ReturnType<typeof getAppointmentsByPatient>>[number] | null,
    cares: [] as Awaited<ReturnType<typeof getMyPostCares>>,
    prescriptions: [] as Awaited<ReturnType<typeof getMyPrescriptions>>,
    books: [] as Awaited<ReturnType<typeof getMyActiveBooks>>,
    ordersPending: 0,
  });

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(false);

    getPatientByProfileId(user.id)
      .then(async (patient) => {
        const [cares, prescriptions, books, orders, appointments] = await Promise.all([
          getMyPostCares(user.id),
          getMyPrescriptions(user.id),
          getMyActiveBooks(user.id),
          getMyBookOrders(user.id),
          patient ? getAppointmentsByPatient(patient.id) : Promise.resolve([]),
        ]);

        setSummary({
          nextAppointment: appointments.find((item) => item.status !== "Cancelada") ?? null,
          cares,
          prescriptions,
          books,
          ordersPending: orders.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Preparando tu panel..." />;
  if (error) return <ErrorState label="No pudimos cargar tu panel privado." />;

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.92),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Portal del paciente
        </p>
        <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.92] md:text-6xl">
          Bienvenida, {profile?.full_name?.split(" ")[0] ?? "de nuevo"}.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
          Bienvenida/o, {profile?.full_name ?? "a tu portal"}. Aqui puedes consultar tus citas, recetas, cuidados y libros adquiridos.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Proxima cita"
          value={summary.nextAppointment ? formatDate(summary.nextAppointment.appointment_date) : "Sin fecha"}
        />
        <SummaryCard label="Cuidados visibles" value={String(summary.cares.length)} />
        <SummaryCard label="Recetas activas" value={String(summary.prescriptions.length)} />
        <SummaryCard label="Libros disponibles" value={String(summary.books.length)} />
        <SummaryCard label="Pedidos pendientes" value={String(summary.ordersPending)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
          <h2 className="text-xl font-semibold">Tu proxima actividad</h2>
          {summary.nextAppointment ? (
            <div className="mt-5 rounded-[22px] bg-[rgba(247,242,236,0.78)] p-5">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{summary.nextAppointment.title}</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                {formatDate(summary.nextAppointment.appointment_date)} · {summary.nextAppointment.start_time}
                <br />
                {summary.nextAppointment.city} {summary.nextAppointment.location ? `· ${summary.nextAppointment.location}` : ""}
              </p>
            </div>
          ) : (
            <EmptyState label="Todavia no tienes una cita programada." />
          )}
        </div>

        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
          <h2 className="text-xl font-semibold">Ultimos cuidados</h2>
          <div className="mt-5 grid gap-3">
            {summary.cares.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{item.care_instructions}</p>
              </div>
            ))}
            {summary.cares.length === 0 && <EmptyState label="Cuando enviemos cuidados posteriores, apareceran aqui." />}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5">
      <p className="text-sm text-[var(--color-copy)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
