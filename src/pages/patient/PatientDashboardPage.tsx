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
import { getMySavingsCards } from "../../services/savingsCardService";
import { formatDate } from "../../utils/text";

export function PatientDashboardPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [summary, setSummary] = useState({
    nextAppointment: null as Awaited<ReturnType<typeof getAppointmentsByPatient>>[number] | null,
    nextReservation: null as Awaited<ReturnType<typeof getMyReservations>>[number] | null,
    appointments: [] as Awaited<ReturnType<typeof getAppointmentsByPatient>>,
    reservations: [] as Awaited<ReturnType<typeof getMyReservations>>,
    cares: [] as Awaited<ReturnType<typeof getMyPostCares>>,
    prescriptions: [] as Awaited<ReturnType<typeof getMyPrescriptions>>,
    books: [] as Awaited<ReturnType<typeof getMyActiveBooks>>,
    ordersPending: 0,
    courseEnrollmentsPending: 0,
    promotionOrdersPending: 0,
    savingsCardsActive: 0,
  });

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(false);

    getPatientByProfileId(user.id)
      .then(async (patient) => {
        const [cares, prescriptions, books, orders, appointments, reservations, courseEnrollments, promotionOrders, savingsCards] = await Promise.all([
          getMyPostCares(user.id),
          getMyPrescriptions(user.id),
          getMyActiveBooks(user.id),
          getMyBookOrders(user.id),
          patient ? getAppointmentsByPatient(patient.id) : Promise.resolve([]),
          getMyReservations(user.id),
          getMyCourseEnrollments(user.id),
          getMyPromotionOrders(user.id),
          getMySavingsCards(),
        ]);

        setSummary({
          nextAppointment: appointments.find((item) => item.status !== "Cancelada") ?? null,
          nextReservation: reservations.find((item) => item.status === "Pendiente" || item.status === "Confirmada") ?? null,
          appointments,
          reservations,
          cares,
          prescriptions,
          books,
          ordersPending: orders.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
          courseEnrollmentsPending: courseEnrollments.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
          promotionOrdersPending: promotionOrders.filter((item) => item.status === "Pendiente" || item.status === "En revision").length,
          savingsCardsActive: savingsCards.length,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Preparando tu panel..." />;
  if (error) return <ErrorState label="No pudimos cargar tu panel privado." />;

  const nextDate = summary.nextAppointment?.appointment_date ?? summary.nextReservation?.appointment_date ?? null;
  const activeActivitiesCount =
    summary.appointments.filter((item) => item.status !== "Cancelada").length +
    summary.reservations.filter((item) => item.status === "Pendiente" || item.status === "Confirmada").length;
  const upcomingItems = [
    ...summary.reservations
      .filter((item) => item.status === "Pendiente" || item.status === "Confirmada")
      .map((item) => ({
        id: `reservation-${item.id}`,
        title: item.appointment_type,
        date: item.appointment_date,
        time: item.start_time,
        status: item.status,
        location: item.location ?? item.city,
        doctor: item.doctor_profiles?.full_name ?? null,
      })),
    ...summary.appointments
      .filter((item) => item.status !== "Cancelada")
      .map((item) => ({
        id: `appointment-${item.id}`,
        title: item.title,
        date: item.appointment_date,
        time: item.start_time,
        status: item.status,
        location: item.location ?? item.city,
        doctor: item.doctor_profiles?.full_name ?? null,
      })),
  ]
    .sort((left, right) => `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`))
    .slice(0, 4);

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
        <SummaryCard label="Citas activas" value={String(activeActivitiesCount)} />
        <SummaryCard label="Cuidados visibles" value={String(summary.cares.length)} />
        <SummaryCard label="Recetas activas" value={String(summary.prescriptions.length)} />
        <SummaryCard label="Libros disponibles" value={String(summary.books.length)} />
        <SummaryCard label="Pedidos de libros" value={String(summary.ordersPending)} />
        <SummaryCard label="Cursos pendientes" value={String(summary.courseEnrollmentsPending)} />
        <SummaryCard label="Promociones pendientes" value={String(summary.promotionOrdersPending)} />
        <SummaryCard label="Tarjetas ahorro" value={String(summary.savingsCardsActive)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
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
          <h2 className="text-xl font-semibold">Recetas recientes</h2>
          <div className="mt-5 grid gap-3">
            {summary.prescriptions.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-7 text-[var(--color-copy)]">{item.prescription_text}</p>
              </div>
            ))}
            {summary.prescriptions.length === 0 && <EmptyState label="Cuando enviemos nuevas recetas, apareceran aqui." />}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Tus proximas citas</h2>
            <Link to="/mi-panel/citas" className="text-sm font-semibold text-[var(--color-mocha)]">
              Ver todas
            </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {upcomingItems.map((item) => (
              <div key={item.id} className="rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-[var(--color-ink)]">{item.title}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  {formatDate(item.date)} Â· {item.time?.slice(0, 5)}
                  <br />
                  {item.location ?? "Lugar por confirmar"}
                  {item.doctor ? ` Â· ${item.doctor}` : ""}
                </p>
              </div>
            ))}
            {upcomingItems.length === 0 ? <EmptyState label="Todavia no tienes actividades proximas." /> : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Ultimos cuidados</h2>
            <Link to="/mi-panel/cuidados" className="text-sm font-semibold text-[var(--color-mocha)]">
              Ver cuidados
            </Link>
          </div>
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

      <section className="grid gap-4 md:grid-cols-3">
        <QuickLinkCard
          title="Mis citas"
          detail="Revisa si tienes algo pendiente, aprobado o rechazado y sube tus comprobantes."
          href="/mi-panel/citas"
          label="Abrir citas"
        />
        <QuickLinkCard
          title="Reservar nueva cita"
          detail="Elige horario real, paga por QR y deja el comprobante en el mismo flujo."
          href="/mi-panel/reservar-cita"
          label="Reservar ahora"
        />
        <QuickLinkCard
          title="Completar mi perfil"
          detail="Agrega contacto de emergencia, direccion y datos clinicos para un mejor seguimiento."
          href="/mi-panel/perfil"
          label="Editar perfil"
        />
        <QuickLinkCard
          title="Tarjetas de ahorro"
          detail="Activa tu token, sube un comprobante por cada mes y sigue el estado de tus cuotas."
          href="/mi-panel/tarjetas-ahorro"
          label="Abrir ahorro"
        />
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

function QuickLinkCard({ title, detail, href, label }: { title: string; detail: string; href: string; label: string }) {
  return (
    <Link to={href} className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 transition hover:bg-white">
      <p className="text-lg font-semibold text-[var(--color-ink)]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{detail}</p>
      <p className="mt-4 text-sm font-semibold text-[var(--color-mocha)]">{label}</p>
    </Link>
  );
}

function getStatusBadgeClass(status: string) {
  if (status === "Confirmada" || status === "Realizada") return "bg-emerald-100 text-emerald-800";
  if (status === "Pendiente") return "bg-amber-100 text-amber-800";
  if (status === "Rechazada" || status === "Cancelada") return "bg-rose-100 text-rose-800";
  return "bg-[rgba(216,194,174,0.26)] text-[var(--color-mocha)]";
}
