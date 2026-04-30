import { useEffect, useMemo, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircleMore, Search, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import { getAdminDoctors, type DoctorProfileRow } from "../../services/doctorService";
import { getPatients, type PatientRow } from "../../services/patientService";
import {
  bookAppointmentSlot,
  getReservationsAdmin,
  updateReservation,
  updateReservationStatus,
  type AppointmentReservationRow,
  type ReservationStatus,
} from "../../services/reservationService";
import { formatDate } from "../../utils/text";

const statuses: ReservationStatus[] = ["Pendiente", "Confirmada", "Realizada", "Cancelada", "Rechazada"];
const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Revision postratamiento", "Consulta general"];

const manualSchema = z.object({
  patient_id: z.string().min(1, "Selecciona paciente."),
  city: z.string().min(2, "Ciudad obligatoria."),
  appointment_type: z.string().min(2, "Tipo obligatorio."),
  date: z.string().min(1, "Fecha obligatoria."),
  notes: z.string().optional(),
});

type ManualForm = z.infer<typeof manualSchema>;

export function ReservationsAdminPage() {
  const [rows, setRows] = useState<AppointmentReservationRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [filters, setFilters] = useState({ query: "", city: "Todas", status: "Todos", type: "Todos", date: "" });
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const form = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      patient_id: "",
      city: "Cochabamba",
      appointment_type: "Valoracion estetica",
      date: "",
      notes: "",
    },
  });

  const watched = form.watch();

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      getReservationsAdmin({
        city: filters.city,
        status: filters.status,
        appointment_type: filters.type,
        date: filters.date,
        query: filters.query,
      }),
      getPatients(),
      getAdminDoctors(),
    ])
      .then(([reservations, nextPatients, nextDoctors]) => {
        setRows(reservations);
        setPatients(nextPatients);
        setDoctors(nextDoctors.filter((doctor) => doctor.is_active));
      })
      .catch((err) => setError(err.message ?? "No pudimos cargar las reservas."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters.city, filters.date, filters.query, filters.status, filters.type]);

  useEffect(() => {
    if (!watched.city || !watched.appointment_type || !watched.date) {
      setSlots([]);
      return;
    }

    setLoadingSlots(true);
    setSelectedSlot(null);
    getAvailableSlots({
      city: watched.city,
      appointment_type: watched.appointment_type,
      date_from: watched.date,
      date_to: watched.date,
    })
      .then(setSlots)
      .catch((err) => setError(err.message ?? "No pudimos cargar horarios disponibles."))
      .finally(() => setLoadingSlots(false));
  }, [watched.appointment_type, watched.city, watched.date]);

  const cities = useMemo(() => [...new Set(rows.map((row) => row.city).filter(Boolean))], [rows]);
  const selectedPatient = patients.find((patient) => patient.id === watched.patient_id);

  const submit = async (values: ManualForm) => {
    if (!selectedSlot) {
      setError("Selecciona un horario disponible.");
      return;
    }
    if (!selectedPatient?.profile_id) {
      setError("El paciente necesita estar vinculado a un usuario para reservar.");
      return;
    }

    setError("");
    setSuccess("");
    try {
      await bookAppointmentSlot({
        user_id: selectedPatient.profile_id,
        patient_id: values.patient_id,
        rule_id: selectedSlot.rule_id,
        date: selectedSlot.date,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        city: selectedSlot.city,
        appointment_type: selectedSlot.appointment_type,
        notes: values.notes,
      });
      setSuccess("Cita creada sin choque de horario.");
      form.reset({ ...values, notes: "" });
      setSelectedSlot(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos reservar ese horario.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
            Reservas y citas
          </p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Agenda clínica sin duplicados</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Confirma, cancela o registra citas manuales usando solamente horarios disponibles.
          </p>
        </div>
      </div>

      {success && <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">{success}</div>}
      {error && <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">{error}</div>}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={form.handleSubmit(submit)} className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-6">
          <h2 className="text-2xl font-semibold">Crear cita manual</h2>
          <p className="mt-1 text-sm text-[var(--color-copy)]">El sistema bloquea automaticamente horarios ocupados.</p>

          <div className="mt-6 grid gap-4">
            <Field label="Paciente" error={form.formState.errors.patient_id?.message}>
              <select {...form.register("patient_id")} className="premium-input">
                <option value="">Seleccionar paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name} · {patient.phone ?? "sin celular"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ciudad" error={form.formState.errors.city?.message}>
                <input {...form.register("city")} className="premium-input" />
              </Field>
              <Field label="Tipo de cita" error={form.formState.errors.appointment_type?.message}>
                <select {...form.register("appointment_type")} className="premium-input">
                  {appointmentTypes.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Fecha" error={form.formState.errors.date?.message}>
              <input type="date" {...form.register("date")} className="premium-input" />
            </Field>
            <Field label="Notas internas">
              <textarea {...form.register("notes")} className="premium-input min-h-24" />
            </Field>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold">Horarios disponibles</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {loadingSlots && <p className="col-span-full text-sm text-[var(--color-copy)]">Buscando horarios...</p>}
              {!loadingSlots && slots.length === 0 && <p className="col-span-full text-sm text-[var(--color-copy)]">No hay horarios para esos filtros.</p>}
              {slots.map((slot) => (
                <button
                  type="button"
                  key={`${slot.rule_id}-${slot.date}-${slot.start_time}`}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                    selectedSlot === slot ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white" : "border-[var(--color-border)] bg-white/70"
                  }`}
                >
                  {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                  <span className="block text-[11px] opacity-80">{slot.available_capacity} cupo(s)</span>
                </button>
              ))}
            </div>
          </div>

          <button className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            <Send className="h-4 w-4" />
            Crear cita
          </button>
        </form>

        <section className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.72)] p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
              <input
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                className="premium-input pl-11"
                placeholder="Buscar paciente, tipo o celular"
              />
            </div>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="premium-input lg:max-w-44">
              <option>Todos</option>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} className="premium-input lg:max-w-44">
              <option>Todas</option>
              {cities.map((city) => <option key={city}>{city}</option>)}
            </select>
          </div>

          <div className="mt-5 grid gap-3">
            {loading && <LoadingState />}
            {!loading && error && <ErrorState label={error} />}
            {!loading && !error && rows.length === 0 && <EmptyState label="No hay reservas con esos filtros." />}
            {!loading && rows.map((row) => (
              <ReservationCard key={row.id} row={row} doctors={doctors} onChanged={load} />
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function ReservationCard({ row, doctors, onChanged }: { row: AppointmentReservationRow; doctors: DoctorProfileRow[]; onChanged: () => void }) {
  const phone = row.patients?.phone?.replace(/\D/g, "") ?? "";
  const message = `Hola ${row.patients?.full_name ?? ""}, te escribimos de parte de la Dra. Estefany sobre tu cita de ${row.appointment_type} del ${row.appointment_date} a las ${row.start_time}.`;

  return (
    <article className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
            {row.city} · {row.appointment_type}
          </p>
          <h3 className="mt-2 text-lg font-semibold">{row.patients?.full_name ?? "Paciente"}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            {formatDate(row.appointment_date)} · {row.start_time.slice(0, 5)} - {row.end_time.slice(0, 5)}
            <br />
            {row.location ?? "Sin ubicacion"} · Origen: {row.source}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={row.status}
            onChange={(event) => void updateReservationStatus(row.id, event.target.value as ReservationStatus).then(onChanged)}
            className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold"
          >
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select
            value={row.doctor_id ?? ""}
            onChange={(event) => void updateReservation(row.id, { doctor_id: event.target.value || null }).then(onChanged)}
            className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold"
          >
            <option value="">Sin doctora</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}
          </select>
          {phone && (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] p-3">
              <MessageCircleMore className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </label>
  );
}
