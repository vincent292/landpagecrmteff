import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircleMore, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { useFormDraft } from "../../hooks/useFormDraft";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { createAppointment, getAppointmentsByPatient, updateAppointmentStatus, type AppointmentRow } from "../../services/appointmentService";
import { getAvailableSlots, getAvailabilityRulesByIds, type AvailableSlot } from "../../services/availabilityService";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import { getAdminDoctors, getMyDoctorProfile, type DoctorProfileRow } from "../../services/doctorService";
import { getPatientById, type PatientRow } from "../../services/patientService";
import {
  bookAppointmentSlot,
  getReservationsByPatientId,
  updateReservation,
  updateReservationStatus,
  type AppointmentReservationRow,
} from "../../services/reservationService";
import { formatDate } from "../../utils/text";

const schema = z.object({
  city: z.string().min(2, "Selecciona la ciudad."),
  date: z.string().min(1, "Selecciona la fecha."),
  doctor_id: z.string().optional(),
  notes: z.string().optional(),
  register_payment_now: z.boolean().default(false),
  payment_amount: z.coerce.number().min(0, "El monto no puede ser negativo."),
  payment_method: z.string().min(1, "Selecciona metodo."),
});

type FormValuesInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

type SlotWithDoctor = AvailableSlot & {
  doctor_id: string | null;
  doctor_name: string | null;
  doctor_whatsapp: string | null;
  doctor_email: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = "message" in error ? error.message : null;
    const maybeDetails = "details" in error ? error.details : null;
    const maybeHint = "hint" in error ? error.hint : null;
    const parts = [maybeMessage, maybeDetails, maybeHint].filter((value) => typeof value === "string" && value.trim().length > 0);
    if (parts.length > 0) return parts.join(" · ");
  }
  return fallback;
}

export function PatientAppointmentsAdminPage() {
  const { id = "" } = useParams();
  const { role, profile, user } = useAuth();
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [items, setItems] = useState<AppointmentRow[]>([]);
  const [reservations, setReservations] = useState<AppointmentReservationRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [slots, setSlots] = useState<SlotWithDoctor[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotWithDoctor | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [slotTypeFilter, setSlotTypeFilter] = useWorkspaceState(`admin:patient-appointments:${id}:slot-type`, "Todos", { ttlMs: 1000 * 60 * 60 * 8 });
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [doctorProfileResolved, setDoctorProfileResolved] = useState(role !== "doctor");
  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;

  const form = useForm<FormValuesInput, undefined, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      city: "Cochabamba",
      date: "",
      doctor_id: "",
      notes: "",
      register_payment_now: false,
      payment_amount: 0,
      payment_method: "efectivo",
    },
  });
  const { clearDraft } = useFormDraft(form, `admin:patient-appointments:${id}:draft`, {
    ttlMs: 1000 * 60 * 60,
    isEmpty: (value) => !Object.values(value ?? {}).some((item) => {
      if (typeof item === "boolean") return item;
      if (typeof item === "number") return item > 0;
      return typeof item === "string" && item.trim().length > 0;
    }),
  });
  const doctorFieldLocked = role === "doctor" && Boolean(doctorProfileId);

  const watched = form.watch();

  const load = () =>
    void Promise.all([
      getAppointmentsByPatient(id, role === "superadmin"),
      getReservationsByPatientId(id, role === "superadmin"),
      getPatientById(id),
      getAdminDoctors(),
      getCashPaymentMethods(true),
    ]).then(([appointments, reservationRows, patientRow, doctorRows, methods]) => {
      setItems(appointments);
      setReservations(reservationRows);
      setPatient(patientRow);
      setDoctors(
        doctorRows.filter((doctor) =>
          doctor.is_active && (!doctorFieldLocked || doctor.id === doctorProfileId)
        )
      );
      setPaymentMethods(methods);
    });

  useEffect(() => {
    if (role !== "doctor" || !profile?.id) {
      setDoctorProfileId(null);
      setDoctorProfileResolved(true);
      return;
    }

    setDoctorProfileResolved(false);
    getMyDoctorProfile(profile.id)
      .then((doctor) => setDoctorProfileId(doctor?.id ?? null))
      .catch(() => setDoctorProfileId(null))
      .finally(() => setDoctorProfileResolved(true));
  }, [profile?.id, role]);

  useEffect(() => {
    if (role === "doctor" && !doctorProfileResolved) return;
    if (role === "doctor" && !doctorProfileId) {
      setItems([]);
      setReservations([]);
      setDoctors([]);
      return;
    }
    load();
  }, [doctorFieldLocked, doctorProfileId, doctorProfileResolved, id, role]);

  useEffect(() => {
    if (!doctorFieldLocked || !doctorProfileId) return;
    if (watched.doctor_id !== doctorProfileId) {
      form.setValue("doctor_id", doctorProfileId, { shouldDirty: false, shouldValidate: false });
    }
  }, [doctorFieldLocked, doctorProfileId, form, watched.doctor_id]);

  useEffect(() => {
    if (role === "doctor" && !doctorProfileId) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }
    if (!watched.city || !watched.date) {
      setSlots([]);
      setSelectedSlot(null);
      setSlotTypeFilter("Todos");
      return;
    }

    setLoadingSlots(true);
    setSelectedSlot(null);
    setMessage("");
    setSlotTypeFilter("Todos");

    getAvailableSlots({
      city: watched.city,
      date_from: watched.date,
      date_to: watched.date,
      doctor_id: doctorFieldLocked ? doctorProfileId : watched.doctor_id || null,
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
      .catch((error) => setMessage(getErrorMessage(error, "No pudimos cargar horarios disponibles.")))
      .finally(() => setLoadingSlots(false));
  }, [doctorFieldLocked, doctorProfileId, role, watched.city, watched.date, watched.doctor_id]);

  const availableDoctors = useMemo(
    () =>
      doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.full_name,
      })),
    [doctors]
  );

  const availableSlotTypes = useMemo(
    () => ["Todos", ...new Set(slots.map((slot) => slot.appointment_type).filter(Boolean))],
    [slots]
  );

  const filteredSlots = useMemo(
    () =>
      slots.filter((slot) => {
        const matchesDoctor = !watched.doctor_id || slot.doctor_id === watched.doctor_id;
        const matchesType = slotTypeFilter === "Todos" || slot.appointment_type === slotTypeFilter;
        return matchesDoctor && matchesType;
      }),
    [slotTypeFilter, slots, watched.doctor_id]
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
      if (patient?.profile_id) {
        const reservation = await bookAppointmentSlot({
          user_id: patient.profile_id,
          patient_id: patient.id,
          rule_id: selectedSlot.rule_id,
          date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
          city: values.city,
          appointment_type: selectedSlot.appointment_type,
          care_mode: selectedSlot.care_mode,
          notes: values.notes,
        });
        if (values.register_payment_now && values.payment_amount > 0) {
          await updateReservationStatus(reservation.id, "Confirmada");
          await updateReservation(reservation.id, {
            payment_amount: values.payment_amount,
            payment_method: values.payment_method,
            payment_verified_at: new Date().toISOString(),
          });
        }
      } else {
        await createAppointment({
          patient_id: id,
          created_by: user?.id ?? null,
          doctor_id: selectedSlot.doctor_id,
          title: selectedSlot.appointment_type,
          appointment_date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
          city: values.city,
          location: selectedSlot.location,
          status: values.register_payment_now && values.payment_amount > 0 ? "Confirmada" : "Programada",
          payment_amount: values.register_payment_now && values.payment_amount > 0 ? values.payment_amount : null,
          payment_method: values.register_payment_now && values.payment_amount > 0 ? values.payment_method : null,
          payment_status: values.register_payment_now && values.payment_amount > 0 ? "Pagado" : "Pendiente",
          notes: values.notes,
        });
      }
      form.reset({
        city: values.city,
        date: "",
        doctor_id: doctorFieldLocked ? doctorProfileId ?? "" : "",
        notes: "",
        register_payment_now: false,
        payment_amount: 0,
        payment_method: values.payment_method,
      });
      clearDraft();
      setSlots([]);
      setSelectedSlot(null);
      setMessage(
        patient?.profile_id
          ? values.register_payment_now && values.payment_amount > 0
            ? "Reserva creada, confirmada y mandada a caja."
            : "Reserva creada correctamente. La paciente ya puede entrar a su panel, pagar por QR y subir su comprobante."
          : values.register_payment_now && values.payment_amount > 0
            ? "Cita interna creada y cobrada. El ingreso ya fue enviado a caja."
            : "Cita programada correctamente. Esta paciente no tiene usuario enlazado, por eso se guardo como cita interna."
      );
      load();
    } catch (error) {
      setMessage(getErrorMessage(error, "No pudimos guardar la cita."));
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
            <Field label="Fecha" error={form.formState.errors.date?.message}>
              <input type="date" min={new Date().toISOString().slice(0, 10)} {...form.register("date")} className="premium-input" />
            </Field>
            <Field label="Doctora" error={form.formState.errors.doctor_id?.message}>
              <select {...form.register("doctor_id")} className="premium-input" disabled={doctorFieldLocked}>
                {!doctorFieldLocked ? <option value="">Todas las doctoras</option> : null}
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
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" {...form.register("register_payment_now")} className="h-4 w-4" />
              Registrar pago ahora y mandar a caja
            </label>
            {watched.register_payment_now ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Monto pagado" error={form.formState.errors.payment_amount?.message}>
                  <input type="number" min={0} step="0.01" {...form.register("payment_amount")} className="premium-input" />
                </Field>
                <Field label="Metodo de pago" error={form.formState.errors.payment_method?.message}>
                  <select {...form.register("payment_method")} className="premium-input">
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.code}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold">Horarios disponibles</p>
              <select value={slotTypeFilter} onChange={(event) => setSlotTypeFilter(event.target.value)} className="premium-input sm:max-w-64">
                {availableSlotTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === "Todos" ? "Todos los tipos" : type}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {loadingSlots ? (
                <div className="col-span-full">
                  <LoadingState label="Buscando horarios..." />
                </div>
              ) : null}
              {!loadingSlots && filteredSlots.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState label={watched.doctor_id || slotTypeFilter !== "Todos" ? "No hay horarios disponibles con esos filtros para esa fecha." : "No hay horarios disponibles para esa fecha."} />
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
                      <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] opacity-80">{slot.appointment_type}</span>
                      <span className="mt-1 block text-[11px] opacity-80">{slot.doctor_name ?? "Sin doctora"}</span>
                      <span className="block text-[11px] opacity-80">{slot.location ?? slot.city}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          <button disabled={saving || !selectedSlot} className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
            <Send className="h-4 w-4" />
            {saving ? "Guardando..." : patient?.profile_id ? "Agendar y pedir pago" : "Agendar como programada"}
          </button>
        </form>
      </section>

      {reservations.length > 0 ? (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">Reservas con pago del paciente</h2>
          {reservations.map((item) => (
            <article key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{item.appointment_type}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={item.status}
                    onChange={(event) => void updateReservationStatus(item.id, event.target.value as AppointmentReservationRow["status"]).then(load)}
                    className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm"
                    disabled={role === "doctor" && item.doctor_id !== doctorProfileId}
                  >
                    <option>Pendiente</option>
                    <option>Confirmada</option>
                    <option>Realizada</option>
                    <option>Cancelada</option>
                    <option>Rechazada</option>
                  </select>
                  {patient?.phone ? (
                    <a
                      href={`https://wa.me/${patient.phone.replace(/\D/g, "")}?text=${encodeURIComponent(buildReservationMessage(patient.full_name, item))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[var(--color-border)] p-3"
                      aria-label="Enviar reserva por WhatsApp"
                    >
                      <MessageCircleMore className="h-4 w-4" />
                    </a>
                  ) : null}
                  <DeleteActions
                    role={role}
                    row={item}
                    compact
                    onSoftDelete={() => void softDeleteRecord({ table: "appointment_reservations", id: item.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                    onRestore={() => void restoreRecord("appointment_reservations", item.id).then(load)}
                    onHardDelete={() => void hardDeleteRecord("appointment_reservations", item.id).then(load)}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
                {item.payment_receipt_path ? "Comprobante enviado por paciente" : "Pendiente de comprobante"}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                {formatDate(item.appointment_date)} · {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                <br />
                {item.city} · {item.location ?? "Lugar por confirmar"}
                <br />
                {item.doctor_profiles?.full_name ? `Con ${item.doctor_profiles.full_name}` : "Doctora por confirmar"}
              </p>
              <DeletedStatusNote row={item} />
            </article>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4">
        {items.length > 0 ? <h2 className="text-xl font-semibold">Citas internas heredadas</h2> : null}
        {items.map((item) => (
          <article key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={item.status}
                  onChange={(event) => void updateAppointmentStatus(item.id, event.target.value).then(load)}
                  className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm"
                  disabled={role === "doctor" && item.doctor_id !== doctorProfileId}
                >
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
                <DeleteActions
                  role={role}
                  row={item}
                  compact
                  onSoftDelete={() => void softDeleteRecord({ table: "appointments", id: item.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                  onRestore={() => void restoreRecord("appointments", item.id).then(load)}
                  onHardDelete={() => void hardDeleteRecord("appointments", item.id).then(load)}
                />
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
            <DeletedStatusNote row={item} />
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

function buildReservationMessage(patientName: string, item: AppointmentReservationRow) {
  return `Hola ${patientName}, tu reserva esta ${item.status.toLowerCase()} para el ${formatDate(item.appointment_date)} a las ${item.start_time.slice(0, 5)} hasta las ${item.end_time.slice(0, 5)} en ${item.location ?? item.city}, ${item.city}${item.doctor_profiles?.full_name ? ` con ${item.doctor_profiles.full_name}` : ""}. ${item.status === "Pendiente" ? "Recuerda entrar a tu panel para pagar por QR y subir tu comprobante." : ""}`;
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
