import { useEffect, useMemo, useState, type ReactNode } from "react";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ClipboardList,
  Download,
  ExternalLink,
  GraduationCap,
  Mail,
  MessageCircleMore,
  MessagesSquare,
  ReceiptText,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { shouldHidePatientPhone } from "../../lib/patientPrivacy";
import { getBooksAdmin } from "../../services/bookService";
import { getAdminCalendarEvents } from "../../services/calendarService";
import { getCashMovements, getCashRegisterSessions, getCashSessionCounts } from "../../services/cashService";
import { getAdminCourses } from "../../services/courseService";
import { getMyDoctorProfile } from "../../services/doctorService";
import { getCourseEnrollments } from "../../services/enrollmentService";
import { getAdminGalleryAlbums } from "../../services/galleryService";
import { getInventoryItems, getInventoryLots } from "../../services/inventoryService";
import { getInformationRequests, type InformationRequestRow } from "../../services/requestService";
import { getReservationsAdmin, type AppointmentReservationRow } from "../../services/reservationService";
import { getAdminTreatments } from "../../services/treatmentService";
import { formatDate, formatMoney } from "../../utils/text";

export function AdminDashboard() {
  const { role, user } = useAuth();
  const hidePatientPhone = shouldHidePatientPhone(role);
  const [requests, setRequests] = useState<InformationRequestRow[]>([]);
  const [coursesCount, setCoursesCount] = useState(0);
  const [enrollmentsPending, setEnrollmentsPending] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);
  const [treatmentsCount, setTreatmentsCount] = useState(0);
  const [booksCount, setBooksCount] = useState(0);
  const [galleryCount, setGalleryCount] = useState(0);
  const [reservations, setReservations] = useState<AppointmentReservationRow[]>([]);
  const [cashOpenSessions, setCashOpenSessions] = useState(0);
  const [cashIncomeToday, setCashIncomeToday] = useState(0);
  const [cashDifferenceTotal, setCashDifferenceTotal] = useState(0);
  const [inventoryLowStock, setInventoryLowStock] = useState(0);
  const [inventoryExpiringLots, setInventoryExpiringLots] = useState(0);
  const [selectedReservation, setSelectedReservation] = useState<AppointmentReservationRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      if (role === "doctor" && user?.id) {
        const doctorProfile = await getMyDoctorProfile(user.id).catch(() => null);
        const doctorId = doctorProfile?.id ?? null;

        const [courseRows, eventRows, treatmentRows, reservationRows, bookRows, galleryRows] = await Promise.all([
          getAdminCourses(false, doctorId),
          getAdminCalendarEvents(false, doctorId),
          getAdminTreatments(false, doctorId),
          getReservationsAdmin({ doctor_id: doctorId }, false, role),
          getBooksAdmin(false, doctorId),
          getAdminGalleryAlbums(false, doctorId),
        ]);

        setRequests([]);
        setCoursesCount(courseRows.filter((item) => item.is_active).length);
        setEnrollmentsPending(0);
        setEventsCount(eventRows.filter((item) => item.is_active).length);
        setTreatmentsCount(treatmentRows.filter((item) => item.is_active).length);
        setBooksCount(bookRows.filter((item) => item.is_active).length);
        setGalleryCount(galleryRows.filter((item) => item.is_active).length);
        setReservations(reservationRows);
        setCashOpenSessions(0);
        setCashIncomeToday(0);
        setCashDifferenceTotal(0);
        setInventoryLowStock(0);
        setInventoryExpiringLots(0);
        setLoading(false);
        return;
      }

      const [
        requestRows,
        courseRows,
        enrollmentRows,
        eventRows,
        treatmentRows,
        reservationRows,
        cashMovementRows,
        cashSessionRows,
        cashCountRows,
        inventoryItemRows,
        inventoryLotRows,
      ] = await Promise.all([
        getInformationRequests(),
        getAdminCourses(),
        getCourseEnrollments(),
        getAdminCalendarEvents(),
        getAdminTreatments(),
        getReservationsAdmin({}, false, role),
        getCashMovements(),
        getCashRegisterSessions(),
        getCashSessionCounts(),
        getInventoryItems(),
        getInventoryLots(),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const todayDate = new Date(`${today}T00:00:00`);
      const nextThirtyDays = new Date(todayDate);
      nextThirtyDays.setDate(nextThirtyDays.getDate() + 30);

      setRequests(requestRows);
      setCoursesCount(courseRows.filter((item) => item.is_active).length);
      setEnrollmentsPending(enrollmentRows.filter((item) => item.status === "Pendiente").length);
      setEventsCount(eventRows.filter((item) => item.is_active).length);
      setTreatmentsCount(treatmentRows.filter((item) => item.is_active).length);
      setBooksCount(0);
      setGalleryCount(0);
      setReservations(reservationRows);
      setCashOpenSessions(cashSessionRows.filter((item) => item.status === "abierta").length);
      setCashIncomeToday(
        cashMovementRows
          .filter((item) => item.status !== "anulado" && item.movement_type === "ingreso" && item.movement_date === today)
          .reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
      );
      setCashDifferenceTotal(
        cashCountRows.reduce((sum, item) => sum + Math.abs(Number(item.difference_amount ?? 0)), 0)
      );
      setInventoryLowStock(
        inventoryItemRows.filter(
          (item) => item.is_active && Number(item.current_stock ?? 0) <= Number(item.minimum_stock ?? 0)
        ).length
      );
      setInventoryExpiringLots(
        inventoryLotRows.filter((lot) => {
          if (!lot.is_active || !lot.expiration_date || Number(lot.current_quantity ?? 0) <= 0) return false;
          const expiration = new Date(`${lot.expiration_date}T00:00:00`);
          return expiration >= todayDate && expiration <= nextThirtyDays;
        }).length
      );
      setLoading(false);
    };

    void load();
  }, [role, user?.id]);

  const newRequests = useMemo(
    () => requests.filter((item) => item.status === "Nuevo").length,
    [requests]
  );

  const activeReservations = useMemo(
    () => reservations.filter((item) => item.status !== "Cancelada" && item.status !== "Rechazada"),
    [reservations]
  );

  if (loading) return <LoadingState label="Cargando dashboard..." />;

  if (role === "doctor") {
    return (
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[34px] border border-[rgba(198,162,123,0.18)] bg-[linear-gradient(135deg,rgba(255,249,244,0.92),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            Mi panel de doctora
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <h1 className="font-display text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
                Tu agenda, tus pacientes y tu contenido en una sola vista.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
                Este dashboard se aisla por doctora: aqui solo aparecen tus citas, tu agenda y el contenido que te pertenece.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat label="Citas de mi agenda" value={String(activeReservations.length)} href="/panel/citas" />
              <MiniStat label="Eventos propios" value={String(eventsCount)} href="/panel/agenda" />
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Metric icon={<CalendarDays className="h-5 w-5" />} label="Citas propias" value={String(activeReservations.length)} href="/panel/citas" />
          <Metric icon={<Sparkles className="h-5 w-5" />} label="Tratamientos propios" value={String(treatmentsCount)} href="/panel/tratamientos" />
          <Metric icon={<GraduationCap className="h-5 w-5" />} label="Academy propia" value={String(coursesCount)} href="/panel/academy" />
          <Metric icon={<ClipboardList className="h-5 w-5" />} label="Agenda propia" value={String(eventsCount)} href="/panel/agenda" />
          <Metric icon={<ReceiptText className="h-5 w-5" />} label="Libros propios" value={String(booksCount)} href="/panel/libros" />
          <Metric icon={<Users className="h-5 w-5" />} label="Galeria propia" value={String(galleryCount)} href="/panel/galeria" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-xl font-semibold text-[var(--color-ink)]">Mis citas activas</h2>
                <p className="mt-1 text-sm text-[var(--color-copy)]">Solo aparecen reservas ligadas a tu doctora.</p>
              </div>
            </div>
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              height="auto"
              events={activeReservations.map((item) => ({
                id: item.id,
                title: `${item.start_time.slice(0, 5)} ${item.patients?.full_name ?? "Paciente"}`,
                start: `${item.appointment_date}T${item.start_time}`,
                end: `${item.appointment_date}T${item.end_time}`,
                color: getReservationColor(item.status),
              }))}
              eventClick={(info) => setSelectedReservation(activeReservations.find((item) => item.id === info.event.id) ?? null)}
            />
          </div>

          <aside className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Proximas citas</h2>
            <div className="mt-5 grid gap-3">
              {activeReservations.slice(0, 6).map((reservation) => (
                <button
                  key={reservation.id}
                  onClick={() => setSelectedReservation(reservation)}
                  className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.76)] p-4 text-left transition hover:bg-white"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                    {reservation.status} · {reservation.city}
                  </p>
                  <h3 className="mt-2 font-semibold">{reservation.patients?.full_name ?? "Paciente"}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
                    {formatDate(reservation.appointment_date)} · {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
                  </p>
                </button>
              ))}
              {activeReservations.length === 0 ? (
                <p className="text-sm text-[var(--color-copy)]">Todavia no tienes citas activas.</p>
              ) : null}
            </div>
          </aside>
        </section>

        <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Accesos propios</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <QuickCard label="Pacientes" value="Ver expediente" href="/panel/pacientes" />
            <QuickCard label="Calendario de citas" value="Solo mi agenda" href="/panel/calendario-citas" />
            <QuickCard label="Disponibilidad" value="Bloques y horarios" href="/panel/disponibilidad" />
            <QuickCard label="Libros" value={String(booksCount)} href="/panel/libros" />
            <QuickCard label="Tratamientos" value={String(treatmentsCount)} href="/panel/tratamientos" />
            <QuickCard label="Galeria" value={String(galleryCount)} href="/panel/galeria" />
          </div>
        </section>

        {selectedReservation ? (
          <AppointmentModal reservation={selectedReservation} hidePatientPhone={hidePatientPhone} onClose={() => setSelectedReservation(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[34px] border border-[rgba(198,162,123,0.18)] bg-[linear-gradient(135deg,rgba(255,249,244,0.92),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Panel administrativo
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
              Una vista clara para mover el dia a dia de la clinica con elegancia.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
              Aqui concentramos solicitudes, inscripciones, agenda, caja e inventario
              para que el seguimiento sea rapido, ordenado y amable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Solicitudes nuevas" value={String(newRequests)} href="/panel/solicitudes" />
            <MiniStat label="Ingresos de hoy" value={formatMoney(cashIncomeToday)} href="/panel/caja" />
          </div>
        </div>
      </section>

      {inventoryLowStock > 0 || inventoryExpiringLots > 0 ? (
        <InventoryAlertBanner lowStock={inventoryLowStock} expiringLots={inventoryExpiringLots} />
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<MessagesSquare className="h-5 w-5" />} label="Solicitudes nuevas" value={String(newRequests)} href="/panel/solicitudes" />
        <Metric icon={<ClipboardList className="h-5 w-5" />} label="Total solicitudes" value={String(requests.length)} href="/panel/solicitudes" />
        <Metric icon={<GraduationCap className="h-5 w-5" />} label="Academy activa" value={String(coursesCount)} href="/panel/academy" />
        <Metric icon={<Users className="h-5 w-5" />} label="Inscripciones pendientes" value={String(enrollmentsPending)} href="/panel/inscripciones" />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Citas agendadas" value={String(activeReservations.length)} href="/panel/citas" />
        <Metric icon={<Sparkles className="h-5 w-5" />} label="Tratamientos activos" value={String(treatmentsCount)} href="/panel/tratamientos" />
        <Metric icon={<Wallet className="h-5 w-5" />} label="Cajas abiertas" value={String(cashOpenSessions)} href="/panel/caja" />
        <Metric icon={<ReceiptText className="h-5 w-5" />} label="Ingresos de hoy" value={formatMoney(cashIncomeToday)} href="/panel/caja" />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Diferencias por revisar" value={formatMoney(cashDifferenceTotal)} href="/panel/caja" />
        <Metric
          icon={<Boxes className="h-5 w-5" />}
          label="Items con stock bajo"
          value={String(inventoryLowStock)}
          href="/panel/inventario"
          tone={inventoryLowStock > 0 ? "danger" : "default"}
        />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Lotes por vencer" value={String(inventoryExpiringLots)} href="/panel/inventario" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-ink)]">Calendario clinico</h2>
              <p className="mt-1 text-sm text-[var(--color-copy)]">Todas las citas activas de pacientes en una sola vista.</p>
            </div>
          </div>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height="auto"
            events={activeReservations.map((item) => ({
              id: item.id,
              title: `${item.start_time.slice(0, 5)} ${item.patients?.full_name ?? "Paciente"}`,
              start: `${item.appointment_date}T${item.start_time}`,
              end: `${item.appointment_date}T${item.end_time}`,
              color: getReservationColor(item.status),
            }))}
            eventClick={(info) => setSelectedReservation(activeReservations.find((item) => item.id === info.event.id) ?? null)}
          />
        </div>

        <aside className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Proximas citas</h2>
          <div className="mt-5 grid gap-3">
            {activeReservations.slice(0, 6).map((reservation) => (
              <button
                key={reservation.id}
                onClick={() => setSelectedReservation(reservation)}
                className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.76)] p-4 text-left transition hover:bg-white"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  {reservation.status} · {reservation.city}
                </p>
                <h3 className="mt-2 font-semibold">{reservation.patients?.full_name ?? "Paciente"}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
                  {formatDate(reservation.appointment_date)} · {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
                </p>
              </button>
            ))}
            {activeReservations.length === 0 && <p className="text-sm text-[var(--color-copy)]">Todavia no hay citas activas.</p>}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Solicitudes recientes</h2>
          <div className="mt-5 grid gap-3 md:hidden">
            {requests.slice(0, 8).map((request) => (
              <Link
                key={request.id}
                to="/panel/solicitudes"
                className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.76)] p-4 transition hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--color-ink)]">{request.full_name}</h3>
                    <p className="mt-1 text-sm text-[var(--color-copy)]">
                      {request.phone} · {request.city ?? "Sin ciudad"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                    {request.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--color-copy)]">{request.interest_title ?? "General"}</p>
                <p className="mt-2 text-xs text-[var(--color-copy)]">{new Date(request.created_at).toLocaleDateString("es-BO")}</p>
              </Link>
            ))}
          </div>
          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[var(--color-copy)]">
                <tr>
                  <th className="py-3">Nombre</th>
                  <th>Celular</th>
                  <th>Ciudad</th>
                  <th>Interes</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {requests.slice(0, 8).map((request) => (
                  <tr key={request.id} className="border-t border-[rgba(198,162,123,0.14)]">
                    <td className="py-4 font-medium">{request.full_name}</td>
                    <td>{request.phone}</td>
                    <td>{request.city ?? "Sin ciudad"}</td>
                    <td>{request.interest_title ?? "General"}</td>
                    <td>
                      <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                        {request.status}
                      </span>
                    </td>
                    <td>{new Date(request.created_at).toLocaleDateString("es-BO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Prioridades del dia</h2>
            <div className="mt-5 grid gap-3">
              <PriorityItem
                title="Responder nuevas solicitudes"
                detail={`${newRequests} conversaciones necesitan primer contacto.`}
                href="/panel/solicitudes"
              />
              <PriorityItem
                title="Revisar inscripciones Academy"
                detail={`${enrollmentsPending} registros esperan confirmacion.`}
                href="/panel/inscripciones"
              />
              <PriorityItem
                title="Controlar caja del dia"
                detail={`${cashOpenSessions} cajas abiertas y ${formatMoney(cashDifferenceTotal)} en diferencias acumuladas.`}
                href="/panel/caja"
              />
              <PriorityItem
                title="Atender alertas de inventario"
                detail={`${inventoryLowStock} items con stock bajo y ${inventoryExpiringLots} lotes por vencer.`}
                href="/panel/inventario"
              />
              <PriorityItem
                title="Validar agenda activa"
                detail={`${eventsCount} actividades visibles para pacientes y asistentes.`}
                href="/panel/agenda"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Resumen operativo</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <QuickCard label="Solicitudes abiertas" value={String(requests.filter((item) => item.status !== "Finalizado" && item.status !== "Descartado").length)} href="/panel/solicitudes" />
              <QuickCard label="Academy publicada" value={String(coursesCount)} href="/panel/academy" />
              <QuickCard label="Agenda visible" value={String(eventsCount)} href="/panel/agenda" />
              <QuickCard label="Catalogo activo" value={String(treatmentsCount)} href="/panel/tratamientos" />
              <QuickCard label="Caja abierta hoy" value={String(cashOpenSessions)} href="/panel/caja" />
              <QuickCard label="Ingreso visible hoy" value={formatMoney(cashIncomeToday)} href="/panel/caja" />
              <QuickCard label="Stock bajo" value={String(inventoryLowStock)} href="/panel/inventario" />
              <QuickCard label="Lotes por vencer" value={String(inventoryExpiringLots)} href="/panel/inventario" />
            </div>
          </div>
        </div>
      </section>

      {selectedReservation && (
        <AppointmentModal reservation={selectedReservation} hidePatientPhone={hidePatientPhone} onClose={() => setSelectedReservation(null)} />
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  href,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href: string;
  tone?: "default" | "danger";
}) {
  return (
    <Link
      to={href}
      className={
        tone === "danger"
          ? "rounded-[26px] border border-red-300 bg-[linear-gradient(135deg,rgba(176,44,44,0.14),rgba(255,255,255,0.96))] p-5 shadow-[0_18px_50px_rgba(122,42,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,rgba(176,44,44,0.18),rgba(255,255,255,1))]"
          : "rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] transition hover:-translate-y-0.5 hover:bg-white"
      }
    >
      <div className={`flex items-center gap-3 ${tone === "danger" ? "text-red-700" : "text-[var(--color-accent-strong)]"}`}>
        {icon}
        <p className={`text-sm ${tone === "danger" ? "font-semibold text-red-700" : "text-[var(--color-copy)]"}`}>{label}</p>
      </div>
      <p className={`mt-4 text-4xl font-semibold ${tone === "danger" ? "animate-pulse text-red-700" : "text-[var(--color-ink)]"}`}>{value}</p>
      {tone === "danger" ? (
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Atencion inmediata</p>
      ) : null}
    </Link>
  );
}

function InventoryAlertBanner({ lowStock, expiringLots }: { lowStock: number; expiringLots: number }) {
  return (
    <Link
      to="/panel/inventario"
      className="block rounded-[30px] border border-red-300 bg-[linear-gradient(135deg,rgba(166,38,38,0.12),rgba(255,245,245,0.98))] p-5 shadow-[0_22px_60px_rgba(122,42,42,0.14)] transition hover:-translate-y-0.5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-red-600 text-white shadow-[0_12px_28px_rgba(166,38,38,0.28)]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-600">Notificacion de inventario</p>
            <h2 className="mt-2 text-2xl font-semibold text-red-800">Hay insumos que necesitan atencion ahora.</h2>
            <p className="mt-2 text-sm leading-7 text-red-700">
              {lowStock} items con stock bajo y {expiringLots} lotes por vencer. Entra a inventario para revisar, comprar o ajustar.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          Ver inventario
        </span>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link to={href} className="rounded-[24px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4 transition hover:-translate-y-0.5 hover:bg-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
    </Link>
  );
}

function PriorityItem({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link to={href} className="rounded-[22px] bg-[rgba(247,242,236,0.78)] p-4 transition hover:-translate-y-0.5 hover:bg-white">
      <h3 className="font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{detail}</p>
    </Link>
  );
}

function QuickCard({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link to={href} className="rounded-[22px] bg-[rgba(247,242,236,0.78)] p-4 transition hover:-translate-y-0.5 hover:bg-white">
      <p className="text-sm text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </Link>
  );
}

function AppointmentModal({
  reservation,
  hidePatientPhone,
  onClose,
}: {
  reservation: AppointmentReservationRow;
  hidePatientPhone: boolean;
  onClose: () => void;
}) {
  const patientName = reservation.patients?.full_name ?? "Paciente";
  const phone = hidePatientPhone ? "" : reservation.patients?.phone?.replace(/\D/g, "") ?? "";
  const appointmentText = `Cita ${reservation.appointment_type} - ${patientName}`;
  const message = `Hola ${patientName}, te confirmamos tu cita de ${reservation.appointment_type} para el ${formatDate(reservation.appointment_date)} de ${reservation.start_time.slice(0, 5)} a ${reservation.end_time.slice(0, 5)}.`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[30px] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              {reservation.status} · {reservation.city}
            </p>
            <h2 className="mt-3 text-2xl font-semibold">{patientName}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Cerrar
          </button>
        </div>
        <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
          {reservation.appointment_type}
          <br />
          {formatDate(reservation.appointment_date)} · {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
          <br />
          {reservation.location ?? "Sin ubicacion"}
          {!hidePatientPhone ? ` · ${reservation.patients?.phone ?? "Sin celular"}` : ""}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a href={getGoogleCalendarUrl(reservation)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <ExternalLink className="h-4 w-4" />
            Google Calendar
          </a>
          <button onClick={() => downloadIcs(reservation)} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <Download className="h-4 w-4" />
            Apple / ICS
          </button>
          <a href={`mailto:${reservation.patients?.email ?? ""}?subject=${encodeURIComponent(appointmentText)}&body=${encodeURIComponent(message)}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <Mail className="h-4 w-4" />
            Enviar email
          </a>
          {phone && (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-3 text-sm font-semibold text-white">
              <MessageCircleMore className="h-4 w-4" />
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getReservationColor(status: AppointmentReservationRow["status"]) {
  if (status === "Confirmada") return "#6e4a2f";
  if (status === "Pendiente") return "#b88a5a";
  if (status === "Realizada") return "#6f7a60";
  return "#9a6b43";
}

function getGoogleCalendarUrl(reservation: AppointmentReservationRow) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita ${reservation.appointment_type} - ${reservation.patients?.full_name ?? "Paciente"}`,
    dates: `${toCalendarDate(reservation.appointment_date, reservation.start_time)}/${toCalendarDate(reservation.appointment_date, reservation.end_time)}`,
    details: reservation.notes ?? "Cita agendada desde el panel de Dra. Estefany.",
    location: reservation.location ?? reservation.city,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(reservation: AppointmentReservationRow) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dra Estefany//Agenda//ES",
    "BEGIN:VEVENT",
    `UID:${reservation.id}@dra-estefany.local`,
    `DTSTAMP:${toCalendarDate(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 8))}`,
    `DTSTART:${toCalendarDate(reservation.appointment_date, reservation.start_time)}`,
    `DTEND:${toCalendarDate(reservation.appointment_date, reservation.end_time)}`,
    `SUMMARY:${escapeIcs(`Cita ${reservation.appointment_type} - ${reservation.patients?.full_name ?? "Paciente"}`)}`,
    `DESCRIPTION:${escapeIcs(reservation.notes ?? "Cita agendada desde el panel de Dra. Estefany.")}`,
    `LOCATION:${escapeIcs(reservation.location ?? reservation.city)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cita-${reservation.appointment_date}-${reservation.start_time.slice(0, 5).replace(":", "")}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

function toCalendarDate(date: string, time: string) {
  return `${date.replaceAll("-", "")}T${time.replaceAll(":", "").slice(0, 6)}`;
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}
