import { useEffect, useMemo, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarCheck, Clock, MapPin } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation } from "react-router-dom";
import { z } from "zod";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import { createPatient, getPatientByProfileId } from "../../services/patientService";
import { bookAppointmentSlot } from "../../services/reservationService";
import { formatDate } from "../../utils/text";

const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Revision postratamiento", "Consulta general"];

const reservationSchema = z.object({
  city: z.string().min(2, "Selecciona una ciudad."),
  appointment_type: z.string().min(2, "Selecciona el tipo de cita."),
  date: z.string().min(1, "Selecciona una fecha."),
  notes: z.string().optional(),
});

type ReservationForm = z.infer<typeof reservationSchema>;

export function ReserveAppointmentPage({ publicView = false }: { publicView?: boolean }) {
  const { user, profile, loading: authLoading } = useAuth();
  const location = useLocation();
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [nextSlots, setNextSlots] = useState<AvailableSlot[]>([]);
  const [selected, setSelected] = useState<AvailableSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const form = useForm<ReservationForm>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      city: profile?.city ?? "Cochabamba",
      appointment_type: "Valoracion estetica",
      date: "",
      notes: "",
    },
  });

  const watched = form.watch();
  const canSearch = Boolean(watched.city && watched.appointment_type && watched.date);

  useEffect(() => {
    if (!watched.city || !watched.appointment_type) return;
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 45);
    getAvailableSlots({
      city: watched.city,
      appointment_type: watched.appointment_type,
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    })
      .then((rows) => setNextSlots(rows.slice(0, 5)))
      .catch(() => setNextSlots([]));
  }, [watched.appointment_type, watched.city]);

  useEffect(() => {
    if (!canSearch) {
      setSlots([]);
      return;
    }

    setLoadingSlots(true);
    setSelected(null);
    setError("");
    getAvailableSlots({
      city: watched.city,
      appointment_type: watched.appointment_type,
      date_from: watched.date,
      date_to: watched.date,
    })
      .then(setSlots)
      .catch((err) => setError(err.message ?? "No pudimos cargar horarios disponibles."))
      .finally(() => setLoadingSlots(false));
  }, [canSearch, watched.appointment_type, watched.city, watched.date]);

  const groupedSlots = useMemo(() => slots, [slots]);

  if (authLoading) return <LoadingState label="Preparando reserva..." />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const submit = async (values: ReservationForm) => {
    if (!selected) {
      setError("Selecciona un horario disponible.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      let patient = await getPatientByProfileId(user.id);
      if (!patient) {
        patient = await createPatient({
          profile_id: user.id,
          full_name: profile?.full_name ?? user.user_metadata.full_name ?? user.email ?? "Paciente",
          email: profile?.email ?? user.email,
          phone: profile?.phone ?? null,
          city: values.city,
        });
      }

      await bookAppointmentSlot({
        user_id: user.id,
        patient_id: patient.id,
        rule_id: selected.rule_id,
        date: selected.date,
        start_time: selected.start_time,
        end_time: selected.end_time,
        city: selected.city,
        appointment_type: selected.appointment_type,
        notes: values.notes,
      });

      setSuccess("Tu solicitud de cita fue registrada. Te confirmaremos por WhatsApp.");
      setSelected(null);
      const nextSlots = await getAvailableSlots({
        city: values.city,
        appointment_type: values.appointment_type,
        date_from: values.date,
        date_to: values.date,
      });
      setSlots(nextSlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar la cita.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={publicView ? "mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24" : "space-y-8"}>
      <div className="rounded-[34px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_24px_80px_rgba(62,42,31,0.08)] md:p-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
              Reserva inteligente
            </p>
            <h1 className="font-display mt-3 text-5xl font-semibold">Reserva una valoracion</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
              Elige ciudad, tipo de cita y fecha. Solo veras horarios disponibles en tiempo real.
            </p>
          </div>
          {!publicView && (
            <Link to="/mi-panel/citas" className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
              Ver mis citas
            </Link>
          )}
        </div>

        {success && <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">{success}</div>}
        {error && <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">{error}</div>}

        <form onSubmit={form.handleSubmit(submit)} className="mt-8 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <Field label="Ciudad" error={form.formState.errors.city?.message}>
              <input {...form.register("city")} className="premium-input" />
            </Field>
            <Field label="Tipo de cita" error={form.formState.errors.appointment_type?.message}>
              <select {...form.register("appointment_type")} className="premium-input">
                {appointmentTypes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Fecha" error={form.formState.errors.date?.message}>
              <input type="date" {...form.register("date")} className="premium-input" min={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Notas opcionales">
              <textarea {...form.register("notes")} className="premium-input min-h-28" placeholder="Cuéntanos si tienes alguna preferencia o duda." />
            </Field>
            {nextSlots.length > 0 && (
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white/70 p-4">
                <p className="text-sm font-semibold">Proximos horarios disponibles</p>
                <div className="mt-3 grid gap-2">
                  {nextSlots.map((slot) => (
                    <button
                      type="button"
                      key={`${slot.rule_id}-${slot.date}-${slot.start_time}`}
                      onClick={() => {
                        form.setValue("date", slot.date, { shouldValidate: true });
                        setSelected(slot);
                      }}
                      className="rounded-2xl border border-[var(--color-border)] bg-white/75 px-4 py-3 text-left text-sm font-semibold text-[var(--color-mocha)]"
                    >
                      {formatDate(slot.date)} · {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.72)] p-5">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-[var(--color-mocha)]" />
              <h2 className="text-2xl font-semibold">Horarios disponibles</h2>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {loadingSlots && <div className="sm:col-span-2 xl:col-span-3"><LoadingState label="Buscando cupos disponibles..." /></div>}
              {!loadingSlots && !canSearch && <div className="sm:col-span-2 xl:col-span-3"><EmptyState label="Selecciona ciudad, tipo y fecha para ver horarios." /></div>}
              {!loadingSlots && canSearch && groupedSlots.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState label="No hay horarios disponibles para esa fecha." /></div>}
              {!loadingSlots && groupedSlots.map((slot) => (
                <button
                  type="button"
                  key={`${slot.rule_id}-${slot.date}-${slot.start_time}`}
                  onClick={() => setSelected(slot)}
                  className={`rounded-[22px] border p-4 text-left transition ${
                    selected === slot ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white" : "border-[var(--color-border)] bg-white/80"
                  }`}
                >
                  <span className="text-lg font-semibold">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</span>
                  <span className="mt-2 flex items-center gap-2 text-xs opacity-80">
                    <MapPin className="h-3.5 w-3.5" />
                    {slot.location ?? slot.city}
                  </span>
                  <span className="mt-2 block text-xs opacity-80">
                    {slot.available_capacity} de {slot.total_capacity} cupo(s)
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="mt-5 rounded-[22px] bg-white/80 p-4 text-sm text-[var(--color-copy)]">
                <p className="font-semibold text-[var(--color-ink)]">Resumen de reserva</p>
                <p className="mt-2">
                  {formatDate(selected.date)} · {selected.start_time.slice(0, 5)} - {selected.end_time.slice(0, 5)}
                  <br />
                  {selected.city} · {selected.appointment_type}
                </p>
              </div>
            )}

            <button
              disabled={submitting || !selected}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <CalendarCheck className="h-4 w-4" />
              {submitting ? "Reservando..." : "Confirmar solicitud"}
            </button>
          </div>
        </form>
      </div>
    </section>
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
