import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { shouldHidePatientPhone } from "../../lib/patientPrivacy";
import { getAppointmentsByPatient } from "../../services/appointmentService";
import { getClinicalEvolutions, getClinicalHistoriesByPatient, getClinicalHistoryByPatient } from "../../services/clinicalHistoryService";
import { getPatientById } from "../../services/patientService";
import { getPatientPhotos } from "../../services/patientPhotoService";
import { getPostCaresByPatient } from "../../services/postCareService";
import { getPrescriptionsByPatient } from "../../services/prescriptionService";
import { formatPublicTime } from "../../utils/publicContent";
import { formatDate } from "../../utils/text";

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const { role } = useAuth();
  const hidePatientPhone = shouldHidePatientPhone(role);
  const [data, setData] = useState<{
    patient: Awaited<ReturnType<typeof getPatientById>>;
    history: Awaited<ReturnType<typeof getClinicalHistoryByPatient>>;
    histories: Awaited<ReturnType<typeof getClinicalHistoriesByPatient>>;
    evolutions: Awaited<ReturnType<typeof getClinicalEvolutions>>;
    appointments: Awaited<ReturnType<typeof getAppointmentsByPatient>>;
    cares: Awaited<ReturnType<typeof getPostCaresByPatient>>;
    prescriptions: Awaited<ReturnType<typeof getPrescriptionsByPatient>>;
    photos: Awaited<ReturnType<typeof getPatientPhotos>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      getPatientById(id, role),
      getClinicalHistoryByPatient(id),
      getClinicalHistoriesByPatient(id),
      getClinicalEvolutions(id),
      getAppointmentsByPatient(id),
      getPostCaresByPatient(id),
      getPrescriptionsByPatient(id),
      getPatientPhotos(id),
    ])
      .then(([patient, history, histories, evolutions, appointments, cares, prescriptions, photos]) =>
        setData({ patient, history, histories, evolutions, appointments, cares, prescriptions, photos })
      )
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, role]);

  if (loading) return <LoadingState label="Cargando ficha del paciente..." />;
  if (error) return <ErrorState label="No pudimos cargar esta ficha." />;
  if (!data?.patient) return <EmptyState label="No encontramos este paciente." />;

  const nextAppointment = data.appointments.find((item) => item.status !== "Cancelada") ?? null;
  const lastEvolution = data.evolutions[0] ?? null;
  const latestPrescription = data.prescriptions[0] ?? null;
  const latestCare = data.cares[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Ficha del paciente</p>
        <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-display text-5xl font-semibold">{data.patient.full_name}</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              {data.patient.email ?? "Sin correo"}
              {!hidePatientPhone ? ` · ${data.patient.phone ?? "Sin celular"}` : ""}
              {` · ${data.patient.city ?? "Sin ciudad"}`}
              <br />
              Registro: {formatDate(data.patient.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PatientAction href={`/panel/pacientes/${id}/historia-clinica`} label="Ficha clínica" />
            <PatientAction href={`/panel/pacientes/${id}/fotos`} label="Galería clínica" />
            <PatientAction href={`/panel/pacientes/${id}/citas`} label="Crear cita" />
            <PatientAction href={`/panel/pacientes/${id}/recetas`} label="Crear receta" />
            <PatientAction href={`/panel/pacientes/${id}/cuidados`} label="Crear cuidado" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="Datos personales" value={data.patient.city ?? "Sin ciudad"} detail={data.patient.emergency_contact ?? "Sin contacto de emergencia"} />
        <SummaryCard
          title="Próxima cita"
          value={nextAppointment ? nextAppointment.title : "Sin cita"}
          detail={nextAppointment ? `${formatDate(nextAppointment.appointment_date)} · ${nextAppointment.start_time}` : "No hay actividad programada."}
        />
        <SummaryCard
          title="Última evolución"
          value={lastEvolution?.title ?? "Sin evolución"}
          detail={lastEvolution?.treatment_performed ?? "Aún no hay seguimiento clínico cargado."}
        />
        <SummaryCard
          title="Última receta"
          value={latestPrescription?.title ?? "Sin receta"}
          detail={latestPrescription?.indications ?? "No hay receta visible en la ficha."}
        />
        <SummaryCard
          title="Últimos cuidados"
          value={latestCare?.title ?? "Sin cuidados"}
          detail={latestCare?.treatment_name ?? "No hay cuidados postratamiento enviados."}
        />
        <SummaryCard
          title="Fotos recientes"
          value={String(data.photos.length)}
          detail={data.photos.length ? "La galería clínica tiene material reciente." : "Todavía no hay fotos registradas."}
        />
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Resumen de ficha clínica</h2>
            <p className="mt-2 text-sm text-[var(--color-copy)]">
              Desde aquí el equipo puede entrar a registrar nuevas notas médicas, seguimientos y fotos clínicas.
            </p>
          </div>
          <PatientAction href={`/panel/pacientes/${id}/historia-clinica`} label="Abrir ficha clínica" />
        </div>
        <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
          {data.history?.diagnosis ?? data.history?.reason_for_consultation ?? "Todavía no hay notas clínicas cargadas."}
        </p>
        {data.histories.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {data.histories.slice(0, 4).map((item) => (
              <article key={item.id} className="rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  {formatDate(item.session_date ?? item.created_at)}
                  {item.session_time ? ` · ${formatPublicTime(item.session_time)}` : ""}
                </p>
                <h3 className="mt-2 text-base font-semibold">{item.session_title ?? item.reason_for_consultation ?? "Nota clínica"}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
                  Doctora responsable {item.doctor_profiles?.full_name ?? item.profiles?.full_name ?? item.profiles?.email ?? "equipo médico"}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  {item.diagnosis ?? item.reason_for_consultation ?? "Sin resumen disponible."}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h2 className="text-xl font-semibold">Fotos recientes</h2>
        {data.photos.length === 0 ? (
          <EmptyState label="No hay fotos clínicas registradas." />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.photos.slice(0, 4).map((photo) => (
              <div key={photo.id} className="rounded-[20px] bg-[rgba(247,242,236,0.78)] p-3">
                <img src={photo.signed_url ?? ""} alt={photo.photo_type} className="h-52 w-full rounded-[16px] object-cover" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{photo.treatment_name ?? photo.photo_type}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${photo.is_visible_to_patient ? "bg-[rgba(111,122,96,0.16)] text-[var(--color-copy)]" : "bg-[rgba(184,138,90,0.16)] text-[var(--color-mocha)]"}`}>
                    {photo.is_visible_to_patient ? "Visible" : "Privada"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{title}</h2>
      <p className="mt-4 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{detail}</p>
    </div>
  );
}

function PatientAction({ href, label }: { href: string; label: string }) {
  return (
    <Link to={href} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
      {label}
    </Link>
  );
}
