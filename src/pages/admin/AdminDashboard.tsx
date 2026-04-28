import { useEffect, useMemo, useState } from "react";

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

  const newRequests = useMemo(() => requests.filter((item) => item.status === "Nuevo").length, [requests]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Panel</p>
      <h1 className="font-display mt-3 text-5xl font-semibold">Dashboard clínico</h1>
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Solicitudes nuevas" value={String(newRequests)} />
        <Metric label="Total solicitudes" value={String(requests.length)} />
        <Metric label="Cursos activos" value={String(coursesCount)} />
        <Metric label="Inscripciones pendientes" value={String(enrollmentsPending)} />
        <Metric label="Próximas actividades" value={String(eventsCount)} />
        <Metric label="Tratamientos activos" value={String(treatmentsCount)} />
      </div>
      <div className="mt-8 rounded-[26px] border border-[var(--color-border)] bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Solicitudes recientes</h2>
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
              {requests.slice(0, 6).map((request) => (
                <tr key={request.id} className="border-t border-[rgba(198,162,123,0.14)]">
                  <td className="py-4 font-medium">{request.full_name}</td>
                  <td>{request.phone}</td>
                  <td>{request.city}</td>
                  <td>{request.interest_title}</td>
                  <td>{request.status}</td>
                  <td>{new Date(request.created_at).toLocaleDateString("es-BO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[26px] border border-[var(--color-border)] bg-white/70 p-5">
      <p className="text-sm text-[var(--color-copy)]">{label}</p>
      <p className="mt-3 text-4xl font-semibold">{value}</p>
    </div>
  );
}
