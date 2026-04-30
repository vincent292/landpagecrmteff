import { useEffect, useMemo, useState } from "react";

import { CalendarDays, ClipboardList, GraduationCap, MessagesSquare, Sparkles, Users } from "lucide-react";

import { LoadingState } from "../../components/common/AsyncState";
import { getAdminCalendarEvents } from "../../services/calendarService";
import { getAdminCourses } from "../../services/courseService";
import { getCourseEnrollments } from "../../services/enrollmentService";
import { getInformationRequests, type InformationRequestRow } from "../../services/requestService";
import { getAdminTreatments } from "../../services/treatmentService";

export function AdminDashboard() {
  const [requests, setRequests] = useState<InformationRequestRow[]>([]);
  const [coursesCount, setCoursesCount] = useState(0);
  const [enrollmentsPending, setEnrollmentsPending] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);
  const [treatmentsCount, setTreatmentsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getInformationRequests(),
      getAdminCourses(),
      getCourseEnrollments(),
      getAdminCalendarEvents(),
      getAdminTreatments(),
    ])
      .then(([requestRows, courseRows, enrollmentRows, eventRows, treatmentRows]) => {
        setRequests(requestRows);
        setCoursesCount(courseRows.filter((item) => item.is_active).length);
        setEnrollmentsPending(enrollmentRows.filter((item) => item.status === "Pendiente").length);
        setEventsCount(eventRows.filter((item) => item.is_active).length);
        setTreatmentsCount(treatmentRows.filter((item) => item.is_active).length);
      })
      .finally(() => setLoading(false));
  }, []);

  const newRequests = useMemo(
    () => requests.filter((item) => item.status === "Nuevo").length,
    [requests]
  );

  if (loading) return <LoadingState label="Cargando dashboard..." />;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[34px] border border-[rgba(198,162,123,0.18)] bg-[linear-gradient(135deg,rgba(255,249,244,0.92),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Panel administrativo
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
              Una vista clara para mover el día a día de la clínica con elegancia.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
              Aqui concentramos solicitudes, inscripciones, actividades y tratamientos
              activos para que el seguimiento sea rapido, ordenado y amable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Solicitudes nuevas" value={String(newRequests)} />
            <MiniStat label="Pendientes por revisar" value={String(enrollmentsPending)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Metric icon={<MessagesSquare className="h-5 w-5" />} label="Solicitudes nuevas" value={String(newRequests)} />
        <Metric icon={<ClipboardList className="h-5 w-5" />} label="Total solicitudes" value={String(requests.length)} />
        <Metric icon={<GraduationCap className="h-5 w-5" />} label="Cursos activos" value={String(coursesCount)} />
        <Metric icon={<Users className="h-5 w-5" />} label="Inscripciones pendientes" value={String(enrollmentsPending)} />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Proximas actividades" value={String(eventsCount)} />
        <Metric icon={<Sparkles className="h-5 w-5" />} label="Tratamientos activos" value={String(treatmentsCount)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Solicitudes recientes</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[var(--color-copy)]">
                <tr>
                  <th className="py-3">Nombre</th>
                  <th>Celular</th>
                  <th>Ciudad</th>
                  <th>Interés</th>
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
              />
              <PriorityItem
                title="Revisar inscripciones pendientes"
                detail={`${enrollmentsPending} registros esperan confirmacion.`}
              />
              <PriorityItem
                title="Validar agenda activa"
                detail={`${eventsCount} actividades visibles para pacientes y asistentes.`}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Resumen operativo</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <QuickCard label="Solicitudes abiertas" value={String(requests.filter((item) => item.status !== "Finalizado" && item.status !== "Descartado").length)} />
              <QuickCard label="Cursos publicados" value={String(coursesCount)} />
              <QuickCard label="Agenda visible" value={String(eventsCount)} />
              <QuickCard label="Catalogo activo" value={String(treatmentsCount)} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <div className="flex items-center gap-3 text-[var(--color-accent-strong)]">
        {icon}
        <p className="text-sm text-[var(--color-copy)]">{label}</p>
      </div>
      <p className="mt-4 text-4xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function PriorityItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[22px] bg-[rgba(247,242,236,0.78)] p-4">
      <h3 className="font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{detail}</p>
    </div>
  );
}

function QuickCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-[rgba(247,242,236,0.78)] p-4">
      <p className="text-sm text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
