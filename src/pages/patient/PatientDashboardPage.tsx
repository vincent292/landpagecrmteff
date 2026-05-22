import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getAppointmentsByPatient } from "../../services/appointmentService";
import { getMyBookOrders } from "../../services/bookOrderService";
import { getMyCourseEnrollments } from "../../services/enrollmentService";
import { getMyActiveBooks } from "../../services/bookPortalService";
import { getPatientByProfileId } from "../../services/patientService";
import { getMyPromotionOrders } from "../../services/promotionOrderService";
import { getMyPostCares } from "../../services/postCareService";
import { getMyPrescriptions } from "../../services/prescriptionService";
import { getMyReservations } from "../../services/reservationService";
import { formatDate } from "../../utils/text";

export function PatientDashboardPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [summary, setSummary] = useState({
    nextAppointment: null as Awaited<ReturnType<typeof getAppointmentsByPatient>>[number] | null,
    nextReservation: null as Awaited<ReturnType<typeof getMyReservations>>[number] | null,
    cares: [] as Awaited<ReturnType<typeof getMyPostCares>>,
    prescriptions: [] as Awaited<ReturnType<typeof getMyPrescriptions>>,
    books: [] as Awaited<ReturnType<typeof getMyActiveBooks>>,
    ordersPending: 0,
    courseEnrollmentsPending: 0,
    promotionOrdersPending: 0,
  });

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(false);

    getPatientByProfileId(user.id)
      .then(async (patient) => {
        const [cares, prescriptions, books, orders, appointments, reservations, courseEnrollments, promotionOrders] = await Promise.all([
          getMyPostCares(user.id),
          getMyPrescriptions(user.id),
          getMyActiveBooks(user.id),
          getMyBookOrders(user.id),
          patient ? getAppointmentsByPatient(patient.id) : Promise.resolve([]),
          getMyReservations(user.id),
          getMyCourseEnrollments(user.id),
          getMyPromotionOrders(user.id),
        ]);

        setSummary({
          nextAppointment: appointments.find((item) => item.status !== "Cancelada") ?? null,
          nextReservation: reservations.find((item) => item.status === "Pendiente" || item.status === "Confirmada") ?? null,
          cares,
          prescriptions,
          books,
          ordersPending: orders.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
          courseEnrollmentsPending: courseEnrollments.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
          promotionOrdersPending: promotionOrders.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Preparando tu panel..." />;
  if (error) return <ErrorState label="No pudimos cargar tu panel privado." />;

  const nextDate = summary.nextAppointment?.appointment_date ?? summary.nextReservation?.appointment_date ?? null;

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
        {!profile?.document_number ? (
          <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Necesitamos tu numero de carnet para consolidar correctamente tu historial.{" "}
            <Link to="/mi-panel/perfil" className="font-semibold underline">
              Completar perfil
            </Link>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-7">
        <SummaryCard label="Proxima cita" value={nextDate ? formatDate(nextDate) : "Sin fecha"} />
        <SummaryCard label="Cuidados visibles" value={String(summary.cares.length)} />
        <SummaryCard label="Recetas activas" value={String(summary.prescriptions.length)} />
        <SummaryCard label="Libros disponibles" value={String(summary.books.length)} />
        <SummaryCard label="Pedidos pendientes" value={String(summary.ordersPending)} />
        <SummaryCard label="Cursos pendientes" value={String(summary.courseEnrollmentsPending)} />
        <SummaryCard label="Promociones pendientes" value={String(summary.promotionOrdersPending)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
          <h2 className="text-xl font-semibold">Tu proxima actividad</h2>
          {summary.nextAppointment || summary.nextReservation ? (
            <div className="mt-5 rounded-[22px] bg-[rgba(247,242,236,0.78)] p-5">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                {summary.nextAppointment?.title ?? summary.nextReservation?.appointment_type}
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                {nextDate ? formatDate(nextDate) : "Sin fecha"} · {summary.nextAppointment?.start_time ?? summary.nextReservation?.start_time}
                <br />
                {(summary.nextAppointment?.city ?? summary.nextReservation?.city) ?? ""} {(summary.nextAppointment?.location ?? summary.nextReservation?.location) ? `· ${summary.nextAppointment?.location ?? summary.nextReservation?.location}` : ""}
                {summary.nextAppointment?.doctor_profiles?.full_name ? (
                  <>
                    <br />
                    {summary.nextAppointment.doctor_profiles.full_name}
                  </>
                ) : summary.nextReservation?.doctor_profiles?.full_name ? (
                  <>
                    <br />
                    {summary.nextReservation.doctor_profiles.full_name}
                  </>
                ) : null}
              </p>
              {summary.nextReservation?.status === "Pendiente" ? (
                <>
                  <p className="mt-3 text-sm font-semibold text-[var(--color-accent-strong)]">
                    Pendiente de pago y validacion. Entra a Mis citas para subir tu comprobante.
                  </p>
                  <Link
                    to="/mi-panel/citas"
                    className="mt-4 inline-flex rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Abrir cita y subir comprobante
                  </Link>
                </>
              ) : summary.nextAppointment || summary.nextReservation ? (
                <Link
                  to="/mi-panel/citas"
                  className="mt-4 inline-flex rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
                >
                  Ver detalle de mi cita
                </Link>
              ) : null}
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
