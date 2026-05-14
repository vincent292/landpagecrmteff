import { useEffect, useMemo, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import { getAdminDoctors, type DoctorProfileRow } from "../../services/doctorService";
import { getPatients, type PatientRow } from "../../services/patientService";
import {
  approveReservationPayment,
  bookAppointmentSlot,
  getReservationReceiptUrl,
  getReservationsAdmin,
  rejectReservationPayment,
  updateReservation,
  updateReservationStatus,
  type AppointmentReservationRow,
  type ReservationStatus,
} from "../../services/reservationService";
import { formatDate, formatMoney } from "../../utils/text";

const statuses: ReservationStatus[] = ["Pendiente", "Confirmada", "Realizada", "Cancelada", "Rechazada"];
const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Promocion directa", "Revision postratamiento", "Consulta general"];

const manualSchema = z.object({
  patient_id: z.string().min(1, "Selecciona paciente."),
  city: z.string().min(2, "Ciudad obligatoria."),
  appointment_type: z.string().min(2, "Tipo obligatorio."),
  date: z.string().min(1, "Fecha obligatoria."),
  notes: z.string().optional(),
  collect_payment_now: z.boolean().default(false),
  payment_amount: z.coerce.number().min(0, "El monto no puede ser negativo."),
  payment_method: z.string().min(1, "Selecciona metodo."),
});

type ManualFormInput = z.input<typeof manualSchema>;
type ManualForm = z.output<typeof manualSchema>;

type ApprovalDraft = {
  reservationId: string;
  patientName: string;
  appointmentType: string;
  amount: number;
  paymentMethod: string;
  notes: string;
};

export function ReservationsAdminPage() {
  const [rows, setRows] = useState<AppointmentReservationRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [filters, setFilters] = useState({ query: "", city: "Todas", status: "Todos", type: "Todos", date: "" });
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const form = useForm<ManualFormInput, undefined, ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      patient_id: "",
      city: "Cochabamba",
      appointment_type: "Valoracion estetica",
      date: "",
      notes: "",
      collect_payment_now: false,
      payment_amount: 0,
      payment_method: "efectivo",
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
      getCashPaymentMethods(true),
    ])
      .then(([reservations, nextPatients, nextDoctors, methods]) => {
        setRows(reservations);
        setPatients(nextPatients);
        setDoctors(nextDoctors.filter((doctor) => doctor.is_active));
        setPaymentMethods(methods);
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

  const openApproval = (row: AppointmentReservationRow) => {
    setApprovalDraft({
      reservationId: row.id,
      patientName: row.patients?.full_name ?? "Paciente",
      appointmentType: row.appointment_type,
      amount: Number(row.payment_amount ?? 0),
      paymentMethod: row.payment_method ?? paymentMethods.find((method) => method.is_default)?.code ?? "qr",
      notes: row.admin_notes ?? "",
    });
  };

  const submitApproval = async () => {
    if (!approvalDraft) return;
    if (approvalDraft.amount <= 0) {
      setError("Indica el monto pagado antes de aprobar.");
      return;
    }

    setSavingApproval(true);
    setError("");
    try {
      await approveReservationPayment(approvalDraft.reservationId, {
        adminNotes: approvalDraft.notes,
        paymentAmount: approvalDraft.amount,
        paymentMethod: approvalDraft.paymentMethod,
      });
      setSuccess("Pago aprobado y enviado a caja automaticamente.");
      setApprovalDraft(null);
      load();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "No pudimos aprobar el pago.");
    } finally {
      setSavingApproval(false);
    }
  };

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
      const created = await bookAppointmentSlot({
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

      if (values.collect_payment_now && values.payment_amount > 0) {
        await approveReservationPayment(created.id, {
          adminNotes: values.notes ?? "",
          paymentAmount: values.payment_amount,
          paymentMethod: values.payment_method,
        });
        setSuccess("Cita creada, cobrada y registrada en caja.");
      } else {
        setSuccess("Cita creada sin choque de horario. Queda pendiente de pago.");
      }

      form.reset({
        patient_id: "",
        city: values.city,
        appointment_type: values.appointment_type,
        date: "",
        notes: "",
        collect_payment_now: false,
        payment_amount: 0,
        payment_method: values.payment_method,
      });
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
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Reservas y citas</p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Agenda clinica conectada con caja</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Confirma, cancela o registra citas manuales usando horarios disponibles y dejando trazabilidad del pago cuando ya se cobro.
          </p>
        </div>
      </div>

      {success ? <div className="rounded-[24px] border border-[rgba(111,122,96,0.24)] bg-[rgba(111,122,96,0.12)] px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">{success}</div> : null}
      {error ? <div className="rounded-[24px] border border-[rgba(154,107,67,0.2)] bg-[rgba(154,107,67,0.08)] px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <form onSubmit={form.handleSubmit(submit)} className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-2xl font-semibold">Crear cita manual</h2>
          <p className="mt-1 text-sm text-[var(--color-copy)]">Si ya cobraste la cita, puedes confirmarla y mandarla a caja en el mismo paso.</p>

          <div className="mt-6 grid gap-4">
            <Field label="Paciente" error={form.formState.errors.patient_id?.message}>
              <select {...form.register("patient_id")} className="premium-input">
                <option value="">Seleccionar paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name} - {patient.phone ?? "sin celular"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ciudad" error={form.formState.errors.city?.message}>
                <select {...form.register("city")} className="premium-input">
                  <option value="">Selecciona ciudad</option>
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
                    <option key={item}>{item}</option>
                  ))}
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

          <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" {...form.register("collect_payment_now")} className="h-4 w-4" />
              Registrar pago ahora y confirmar la cita
            </label>
            {watched.collect_payment_now ? (
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

          <div className="mt-6">
            <p className="text-sm font-semibold">Horarios disponibles</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {loadingSlots ? <p className="col-span-full text-sm text-[var(--color-copy)]">Buscando horarios...</p> : null}
              {!loadingSlots && slots.length === 0 ? <p className="col-span-full text-sm text-[var(--color-copy)]">No hay horarios para esos filtros.</p> : null}
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
            {watched.collect_payment_now ? "Crear, confirmar y mandar a caja" : "Crear cita"}
          </button>
        </form>

        <section className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.72)] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
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
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} className="premium-input lg:max-w-44">
              <option>Todas</option>
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid gap-3">
            {loading ? <LoadingState /> : null}
            {!loading && error ? <ErrorState label={error} /> : null}
            {!loading && !error && rows.length === 0 ? <EmptyState label="No hay reservas con esos filtros." /> : null}
            {!loading &&
              rows.map((row) => (
                <ReservationCard
                  key={row.id}
                  row={row}
                  doctors={doctors}
                  onChanged={load}
                  onOpenApproval={openApproval}
                />
              ))}
          </div>
        </section>
      </section>

      {approvalDraft ? (
        <ModalShell title="Aprobar pago de cita" onClose={() => setApprovalDraft(null)}>
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Reserva</p>
              <p className="mt-2 text-lg font-semibold">{approvalDraft.patientName}</p>
              <p className="mt-1 text-sm text-[var(--color-copy)]">{approvalDraft.appointmentType}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto pagado">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(approvalDraft.amount)}
                  onChange={(event) => setApprovalDraft({ ...approvalDraft, amount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>
              <Field label="Metodo de pago">
                <select
                  value={approvalDraft.paymentMethod}
                  onChange={(event) => setApprovalDraft({ ...approvalDraft, paymentMethod: event.target.value })}
                  className="premium-input"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.code}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notas administrativas">
              <textarea
                value={approvalDraft.notes}
                onChange={(event) => setApprovalDraft({ ...approvalDraft, notes: event.target.value })}
                className="premium-input min-h-28"
              />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void submitApproval()} disabled={savingApproval} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {savingApproval ? "Guardando..." : "Aprobar y mandar a caja"}
            </button>
            <button onClick={() => setApprovalDraft(null)} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function ReservationCard({
  row,
  doctors,
  onChanged,
  onOpenApproval,
}: {
  row: AppointmentReservationRow;
  doctors: DoctorProfileRow[];
  onChanged: () => void;
  onOpenApproval: (row: AppointmentReservationRow) => void;
}) {
  const phone = row.patients?.phone?.replace(/\D/g, "") ?? "";
  const message = `Hola ${row.patients?.full_name ?? ""}, te escribimos de parte de la Dra. Estefany sobre tu cita de ${row.appointment_type} del ${row.appointment_date} a las ${row.start_time}.`;
  const hasReceipt = Boolean(row.payment_receipt_path);

  const openReceipt = async () => {
    const url = await getReservationReceiptUrl(row.payment_receipt_path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleStatusChange = async (nextStatus: ReservationStatus) => {
    if (nextStatus === "Confirmada" && row.status !== "Confirmada") {
      onOpenApproval(row);
      return;
    }
    await updateReservationStatus(row.id, nextStatus);
    onChanged();
  };

  return (
    <article className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(198,162,123,0.16)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
              {row.city}
            </span>
            <span className="rounded-full bg-[rgba(62,42,31,0.08)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
              {row.status}
            </span>
            {row.cash_movement_id ? (
              <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">En caja</span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold">{row.patients?.full_name ?? "Paciente"}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            {row.appointment_type}
            <br />
            {formatDate(row.appointment_date)} - {row.start_time.slice(0, 5)} a {row.end_time.slice(0, 5)}
            <br />
            {row.location ?? "Sin ubicacion"} - Origen: {row.source}
            <br />
            {row.payment_amount ? `${formatMoney(row.payment_amount)} - ${row.payment_method ?? "sin metodo"}` : hasReceipt ? "Comprobante cargado, falta validar monto." : "Sin pago confirmado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={row.status} onChange={(event) => void handleStatusChange(event.target.value as ReservationStatus)} className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold">
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select
            value={row.doctor_id ?? ""}
            onChange={(event) => void updateReservation(row.id, { doctor_id: event.target.value || null }).then(onChanged)}
            className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold"
          >
            <option value="">Sin doctora</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name}
              </option>
            ))}
          </select>
          {hasReceipt ? (
            <button onClick={() => void openReceipt()} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Ver comprobante
            </button>
          ) : null}
          {hasReceipt && row.status === "Pendiente" ? (
            <button onClick={() => onOpenApproval(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
              Aprobar pago
            </button>
          ) : null}
          {hasReceipt && row.status === "Pendiente" ? (
            <button onClick={() => void rejectReservationPayment(row.id, row.admin_notes ?? "").then(onChanged)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Rechazar
            </button>
          ) : null}
          {phone ? (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Abrir WhatsApp
            </a>
          ) : null}
        </div>
      </div>
      <textarea
        defaultValue={row.admin_notes ?? ""}
        onBlur={(event) => void updateReservation(row.id, { admin_notes: event.target.value }).then(onChanged)}
        className="premium-input mt-4 min-h-24"
        placeholder="Notas administrativas"
      />
    </article>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Reservas</p>
            <h2 className="font-display mt-2 text-4xl font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Cerrar
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
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
