import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircleMore, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { createAppointment, getAppointmentsByPatient, updateAppointmentStatus, type AppointmentRow } from "../../services/appointmentService";
import { getAvailableSlots, getAvailabilityRulesByIds, type AvailableSlot } from "../../services/availabilityService";
import { getAdminDoctors, type DoctorProfileRow } from "../../services/doctorService";
import { getPatientById, type PatientRow } from "../../services/patientService";
import { formatDate } from "../../utils/text";

const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Revision postratamiento", "Consulta general"];

const schema = z.object({
  city: z.string().min(2, "Selecciona la ciudad."),
  appointment_type: z.string().min(2, "Selecciona el tipo de cita."),
  date: z.string().min(1, "Selecciona la fecha."),
  doctor_id: z.string().min(1, "Selecciona la doctora."),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type SlotWithDoctor = AvailableSlot & {
  doctor_id: string | null;
  doctor_name: string | null;
  doctor_whatsapp: string | null;
  doctor_email: string | null;
};

export function PatientAppointmentsAdminPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [items, setItems] = useState<AppointmentRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [slots, setSlots] = useState<SlotWithDoctor[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotWithDoctor | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      city: "Cochabamba",
      appointment_type: "Valoracion estetica",
      date: "",
      doctor_id: "",
      notes: "",
    },
  });

  const watched = form.watch();

  const load = () =>
    void Promise.all([getAppointmentsByPatient(id), getPatientById(id), getAdminDoctors()]).then(([appointments, patientRow, doctorRows]) => {
      setItems(appointments);
      setPatient(patientRow);
      setDoctors(doctorRows.filter((doctor) => doctor.is_active));
    });

  useEffect(load, [id]);

  useEffect(() => {
    if (!watched.city || !watched.appointment_type || !watched.date) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }

    setLoadingSlots(true);
    setSelectedSlot(null);
    setMessage("");

    getAvailableSlots({
      city: watched.city,
      appointment_type: watched.appointment_type,
      date_from: watched.date,
      date_to: watched.date,
    })
      .then(async (rows) => {
        const rules = await getAvailabilityRulesByIds(rows.map((slot) => slot.rule_id));
        const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));
        const enriched = rows.map((slot) => {
          const rule = ruleMap.get(slot.rule_id);
          return {
            ...slot,
            doctor_id: rule?.doctor_id ?? null,
            doctor_name: rule?.doctor_profiles?.full_name ?? null,
            doctor_whatsapp: rule?.doctor_profiles?.whatsapp ?? null,
            doctor_email: rule?.doctor_profiles?.email ?? null,
          } satisfies SlotWithDoctor;
        });
        setSlots(enriched);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "No pudimos cargar horarios disponibles."))
      .finally(() => setLoadingSlots(false));
  }, [watched.appointment_type, watched.city, watched.date]);

  const availableDoctors = useMemo(
    () =>
      doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.full_name,
      })),
    [doctors]
  );

  const filteredSlots = useMemo(
    () => slots.filter((slot) => !watched.doctor_id || slot.doctor_id === watched.doctor_id),
    [slots, watched.doctor_id]
  );

  useEffect(() => {
    if (!selectedSlot) return;
    if (!watched.doctor_id || selectedSlot.doctor_id === watched.doctor_id) return;
    setSelectedSlot(null);
  }, [selectedSlot, watched.doctor_id]);

  const submit = async (values: FormValues) => {
    if (!selectedSlot) {
      setMessage("Selecciona un horario disponible.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await createAppointment({
        patient_id: id,
        created_by: user?.id ?? null,
        doctor_id: selectedSlot.doctor_id,
        title: values.appointment_type,
        appointment_date: selectedSlot.date,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        city: values.city,
        location: selectedSlot.location,
        status: "Programada",
        notes: values.notes,
      });
      form.reset({
        city: values.city,
        appointment_type: values.appointment_type,
        date: "",
        doctor_id: "",
        notes: "",
      });
      setSlots([]);
      setSelectedSlot(null);
      setMessage("Cita programada correctamente.");
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos guardar la cita.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Citas del paciente</h1>
        {patient ? (
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            Agenda una cita manual para {patient.full_name} usando horarios disponibles y una doctora asignada.
          </p>
        ) : null}
        {message ? (
          <div className="mt-5 rounded-[20px] bg-[rgba(247,242,236,0.82)] px-4 py-3 text-sm font-semibold text-[var(--color-copy)]">
            {message}
          </div>
        ) : null}
        <form onSubmit={form.handleSubmit(submit)} className="mt-6 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ciudad" error={form.formState.errors.city?.message}>
              <select {...form.register("city")} className="premium-input">
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de cita" error={form.formState.errors.appointment_type?.message}>
              <select {...form.register("appointment_type")} className="premium-input">
                {appointmentTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha" error={form.formState.errors.date?.message}>
              <input type="date" min={new Date().toISOString().slice(0, 10)} {...form.register("date")} className="premium-input" />
            </Field>
            <Field label="Doctora" error={form.formState.errors.doctor_id?.message}>
              <select {...form.register("doctor_id")} className="premium-input">
                <option value="">Seleccionar doctora</option>
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notas internas">
            <textarea {...form.register("notes")} className="premium-input min-h-24" />
          </Field>

          <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
            <p className="text-sm font-semibold">Horarios disponibles</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {loadingSlots ? (
                <div className="col-span-full">
                  <LoadingState label="Buscando horarios..." />
                </div>
              ) : null}
              {!loadingSlots && filteredSlots.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState label={watched.doctor_id ? "Esa doctora no tiene horarios disponibles para esa fecha y tipo de cita." : "No hay horarios disponibles para esa combinacion."} />
                </div>
              ) : null}
              {!loadingSlots &&
                filteredSlots.map((slot) => {
                  const isSelected = selectedSlot ? getSlotKey(selectedSlot) === getSlotKey(slot) : false;
                  return (
                    <button
                      type="button"
                      key={getSlotKey(slot)}
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                        isSelected ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white" : "border-[var(--color-border)] bg-white/80"
                      }`}
                    >
                      {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      <span className="mt-1 block text-[11px] opacity-80">{slot.doctor_name ?? "Sin doctora"}</span>
                      <span className="block text-[11px] opacity-80">{slot.location ?? slot.city}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          <button disabled={saving || !selectedSlot} className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
            <Send className="h-4 w-4" />
            {saving ? "Guardando..." : "Agendar como programada"}
          </button>
        </form>
      </section>

      <div className="grid gap-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select value={item.status} onChange={(event) => void updateAppointmentStatus(item.id, event.target.value).then(load)} className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm">
                  <option>Programada</option>
                  <option>Confirmada</option>
                  <option>Realizada</option>
                  <option>Cancelada</option>
                </select>
                {patient?.phone ? (
                  <a
                    href={`https://wa.me/${patient.phone.replace(/\D/g, "")}?text=${encodeURIComponent(buildAppointmentMessage(patient.full_name, item))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--color-border)] p-3"
                    aria-label="Enviar cita por WhatsApp"
                  >
                    <MessageCircleMore className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
              Registrado por {item.profiles?.full_name ?? item.profiles?.email ?? "equipo medico"}
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              {formatDate(item.appointment_date)} · {item.start_time.slice(0, 5)}{item.end_time ? ` - ${item.end_time.slice(0, 5)}` : ""}
              <br />
              {item.city} · {item.location ?? "Lugar por confirmar"}
              <br />
              {item.doctor_profiles?.full_name ? `Con ${item.doctor_profiles.full_name}` : "Doctora por confirmar"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function getSlotKey(slot: SlotWithDoctor) {
  return `${slot.rule_id}-${slot.date}-${slot.start_time}-${slot.end_time}-${slot.doctor_id ?? ""}`;
}

function buildAppointmentMessage(patientName: string, item: AppointmentRow) {
  return `Hola ${patientName}, tu cita esta ${item.status.toLowerCase()} para el ${formatDate(item.appointment_date)} a las ${item.start_time.slice(0, 5)}${item.end_time ? ` hasta las ${item.end_time.slice(0, 5)}` : ""} en ${item.location ?? item.city}, ${item.city}${item.doctor_profiles?.full_name ? ` con ${item.doctor_profiles.full_name}` : ""}.`;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}
