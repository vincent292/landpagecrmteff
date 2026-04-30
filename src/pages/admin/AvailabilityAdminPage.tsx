import { useEffect, useMemo, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, Eye, PauseCircle, Plus, Save, Trash2 } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  deleteAvailabilityBlock,
  deleteAvailabilityRule,
  getAvailabilityBlocks,
  getAvailabilityRules,
  updateAvailabilityBlock,
  updateAvailabilityRule,
  type AvailabilityBlockRow,
  type AvailabilityRuleRow,
} from "../../services/availabilityService";
import { getReservationsAdmin, type AppointmentReservationRow } from "../../services/reservationService";

const days = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miercoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sabado" },
  { value: 0, label: "Domingo" },
];

const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Revision postratamiento", "Consulta general"];

const ruleSchema = z
  .object({
    city: z.string().min(2, "La ciudad es obligatoria."),
    location: z.string().optional(),
    appointment_type: z.string().min(2, "El tipo de cita es obligatorio."),
    availability_type: z.enum(["recurring", "specific"]),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    specific_date: z.string().optional(),
    days: z.array(z.number()).default([]),
    start_time: z.string().min(1, "Indica hora inicio."),
    end_time: z.string().min(1, "Indica hora fin."),
    slot_duration_minutes: z.coerce.number().min(5, "Minimo 5 minutos."),
    break_minutes: z.coerce.number().min(0, "No puede ser negativo."),
    capacity_per_slot: z.coerce.number().min(1, "Minimo 1 cupo."),
    is_active: z.boolean().default(true),
  })
  .refine((value) => value.start_time < value.end_time, {
    message: "La hora inicio debe ser menor que la hora fin.",
    path: ["end_time"],
  })
  .refine((value) => value.availability_type !== "specific" || Boolean(value.specific_date), {
    message: "Elige la fecha especifica.",
    path: ["specific_date"],
  })
  .refine((value) => value.availability_type !== "recurring" || value.days.length > 0, {
    message: "Elige al menos un dia.",
    path: ["days"],
  });

const blockSchema = z
  .object({
    city: z.string().optional(),
    block_date: z.string().min(1, "La fecha es obligatoria."),
    full_day: z.boolean().default(true),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    reason: z.string().optional(),
    is_active: z.boolean().default(true),
  })
  .refine((value) => value.full_day || (Boolean(value.start_time) && Boolean(value.end_time)), {
    message: "Indica hora inicio y fin o marca dia completo.",
    path: ["start_time"],
  })
  .refine((value) => value.full_day || String(value.start_time) < String(value.end_time), {
    message: "La hora inicio debe ser menor que la hora fin.",
    path: ["end_time"],
  });

type RuleForm = z.infer<typeof ruleSchema>;
type BlockForm = z.infer<typeof blockSchema>;

export function AvailabilityAdminPage() {
  const { profile } = useAuth();
  const [rules, setRules] = useState<AvailabilityRuleRow[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlockRow[]>([]);
  const [reservations, setReservations] = useState<AppointmentReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const ruleForm = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema) as unknown as Resolver<RuleForm>,
    defaultValues: {
      city: "Cochabamba",
      location: "",
      appointment_type: "Valoracion estetica",
      availability_type: "recurring",
      start_date: "",
      end_date: "",
      specific_date: "",
      days: [1],
      start_time: "09:00",
      end_time: "12:00",
      slot_duration_minutes: 30,
      break_minutes: 10,
      capacity_per_slot: 1,
      is_active: true,
    },
  });

  const blockForm = useForm<BlockForm>({
    resolver: zodResolver(blockSchema) as unknown as Resolver<BlockForm>,
    defaultValues: {
      city: "",
      block_date: "",
      full_day: true,
      start_time: "",
      end_time: "",
      reason: "",
      is_active: true,
    },
  });

  const watchedRule = ruleForm.watch();
  const previewSlots = useMemo(() => {
    return generatePreviewSlots(
      watchedRule.start_time,
      watchedRule.end_time,
      Number(watchedRule.slot_duration_minutes),
      Number(watchedRule.break_minutes)
    );
  }, [watchedRule.break_minutes, watchedRule.end_time, watchedRule.slot_duration_minutes, watchedRule.start_time]);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([getAvailabilityRules(), getAvailabilityBlocks(), getReservationsAdmin()])
      .then(([nextRules, nextBlocks, nextReservations]) => {
        setRules(nextRules);
        setBlocks(nextBlocks);
        setReservations(nextReservations);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createRule = async (values: RuleForm) => {
    setSaving(true);
    setSuccess("");
    try {
      const common = {
        created_by: profile?.id ?? null,
        city: values.city,
        location: values.location || null,
        appointment_type: values.appointment_type,
        availability_type: values.availability_type,
        start_time: values.start_time,
        end_time: values.end_time,
        slot_duration_minutes: values.slot_duration_minutes,
        break_minutes: values.break_minutes,
        capacity_per_slot: values.capacity_per_slot,
        is_active: values.is_active,
      };

      if (values.availability_type === "specific") {
        await createAvailabilityRule({
          ...common,
          specific_date: values.specific_date,
          start_date: null,
          end_date: null,
          day_of_week: null,
        });
      } else {
        await Promise.all(
          values.days.map((day) =>
            createAvailabilityRule({
              ...common,
              start_date: values.start_date || null,
              end_date: values.end_date || null,
              specific_date: null,
              day_of_week: day,
            })
          )
        );
      }

      ruleForm.reset({ ...values, days: values.days });
      setSuccess("Disponibilidad creada correctamente.");
      load();
    } catch (err) {
      setSuccess("");
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const createBlock = async (values: BlockForm) => {
    setSaving(true);
    setSuccess("");
    try {
      await createAvailabilityBlock({
        created_by: profile?.id ?? null,
        city: values.city || null,
        block_date: values.block_date,
        start_time: values.full_day ? null : values.start_time,
        end_time: values.full_day ? null : values.end_time,
        reason: values.reason || null,
        is_active: values.is_active,
      });
      blockForm.reset();
      setSuccess("Bloqueo guardado.");
      load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = reservations.filter((item) => item.status === "Pendiente").length;
  const confirmedCount = reservations.filter((item) => item.status === "Confirmada").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
            Disponibilidad inteligente
          </p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Horarios sin choques</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Configura ciudades, dias, cupos y bloqueos. Las reservas se validan en Supabase antes de guardarse.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<CalendarDays className="h-5 w-5" />} label="Disponibilidades" value={rules.length} />
        <SummaryCard icon={<PauseCircle className="h-5 w-5" />} label="Bloqueos activos" value={blocks.filter((item) => item.is_active).length} />
        <SummaryCard icon={<Clock className="h-5 w-5" />} label="Pendientes" value={pendingCount} />
        <SummaryCard icon={<Eye className="h-5 w-5" />} label="Confirmadas" value={confirmedCount} />
      </div>

      {success && (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
          {success}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={ruleForm.handleSubmit(createRule)} className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_20px_70px_rgba(62,42,31,0.07)]">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-[rgba(198,162,123,0.16)] p-3 text-[var(--color-mocha)]">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Crear disponibilidad</h2>
              <p className="text-sm text-[var(--color-copy)]">Define cuando atendera la doctora.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="¿En que ciudad atenderas?" error={ruleForm.formState.errors.city?.message}>
              <input {...ruleForm.register("city")} className="premium-input" />
            </Field>
            <Field label="Ubicacion">
              <input {...ruleForm.register("location")} className="premium-input" placeholder="Clinica central" />
            </Field>
            <Field label="Tipo de cita" error={ruleForm.formState.errors.appointment_type?.message}>
              <select {...ruleForm.register("appointment_type")} className="premium-input">
                {appointmentTypes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Modalidad">
              <select {...ruleForm.register("availability_type")} className="premium-input">
                <option value="recurring">Recurrente semanal</option>
                <option value="specific">Fecha especifica</option>
              </select>
            </Field>

            {watchedRule.availability_type === "specific" ? (
              <Field label="Fecha especifica" error={ruleForm.formState.errors.specific_date?.message}>
                <input type="date" {...ruleForm.register("specific_date")} className="premium-input" />
              </Field>
            ) : (
              <>
                <Field label="Fecha inicio">
                  <input type="date" {...ruleForm.register("start_date")} className="premium-input" />
                </Field>
                <Field label="Fecha fin">
                  <input type="date" {...ruleForm.register("end_date")} className="premium-input" />
                </Field>
                <div className="md:col-span-2">
                  <p className="text-sm font-semibold">¿Que dias estaras disponible?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {days.map((day) => {
                      const selected = watchedRule.days?.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            const current = ruleForm.getValues("days") ?? [];
                            ruleForm.setValue(
                              "days",
                              selected ? current.filter((item) => item !== day.value) : [...current, day.value],
                              { shouldValidate: true }
                            );
                          }}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                            selected ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white" : "border-[var(--color-border)] bg-white/70"
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  {ruleForm.formState.errors.days?.message && (
                    <p className="mt-2 text-xs text-red-700">{ruleForm.formState.errors.days.message}</p>
                  )}
                </div>
              </>
            )}

            <Field label="¿Desde que hora?" error={ruleForm.formState.errors.start_time?.message}>
              <input type="time" {...ruleForm.register("start_time")} className="premium-input" />
            </Field>
            <Field label="¿Hasta que hora?" error={ruleForm.formState.errors.end_time?.message}>
              <input type="time" {...ruleForm.register("end_time")} className="premium-input" />
            </Field>
            <Field label="¿Cuanto dura cada cita?" error={ruleForm.formState.errors.slot_duration_minutes?.message}>
              <input type="number" {...ruleForm.register("slot_duration_minutes", { valueAsNumber: true })} className="premium-input" min={5} />
            </Field>
            <Field label="¿Descanso entre pacientes?" error={ruleForm.formState.errors.break_minutes?.message}>
              <input type="number" {...ruleForm.register("break_minutes", { valueAsNumber: true })} className="premium-input" min={0} />
            </Field>
            <Field label="¿Cupos por horario?" error={ruleForm.formState.errors.capacity_per_slot?.message}>
              <input type="number" {...ruleForm.register("capacity_per_slot", { valueAsNumber: true })} className="premium-input" min={1} />
            </Field>
            <label className="flex items-center gap-3 self-end rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 py-3 text-sm font-semibold">
              <input type="checkbox" {...ruleForm.register("is_active")} />
              Activo
            </label>
          </div>

          <button disabled={saving} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar disponibilidad"}
          </button>
        </form>

        <aside className="space-y-6">
          <div className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.78)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              Vista previa
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Horarios que se generaran</h2>
            <div className="mt-5 grid gap-2">
              {previewSlots.length === 0 ? (
                <p className="text-sm text-[var(--color-copy)]">Ajusta las horas para ver la vista previa.</p>
              ) : (
                previewSlots.map((slot) => (
                  <div key={slot} className="rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--color-mocha)]">
                    {slot}
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={blockForm.handleSubmit(createBlock)} className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-6">
            <h2 className="text-2xl font-semibold">Bloquear horario</h2>
            <p className="mt-1 text-sm text-[var(--color-copy)]">Úsalo para viajes, cirugías o días sin atención.</p>
            <div className="mt-5 grid gap-4">
              <Field label="Fecha" error={blockForm.formState.errors.block_date?.message}>
                <input type="date" {...blockForm.register("block_date")} className="premium-input" />
              </Field>
              <Field label="Ciudad opcional">
                <input {...blockForm.register("city")} className="premium-input" placeholder="Todas las ciudades" />
              </Field>
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" {...blockForm.register("full_day")} />
                Bloquear dia completo
              </label>
              {!blockForm.watch("full_day") && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Hora inicio" error={blockForm.formState.errors.start_time?.message}>
                    <input type="time" {...blockForm.register("start_time")} className="premium-input" />
                  </Field>
                  <Field label="Hora fin" error={blockForm.formState.errors.end_time?.message}>
                    <input type="time" {...blockForm.register("end_time")} className="premium-input" />
                  </Field>
                </div>
              )}
              <Field label="Motivo">
                <textarea {...blockForm.register("reason")} className="premium-input min-h-24" />
              </Field>
              <button disabled={saving} className="rounded-full border border-[var(--color-border)] bg-white/70 px-5 py-3 text-sm font-semibold">
                Guardar bloqueo
              </button>
            </div>
          </form>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminList
          title="Disponibilidades"
          loading={loading}
          error={error}
          empty="Todavía no hay disponibilidades."
          rows={rules}
          render={(rule) => (
            <div key={rule.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{rule.city} · {rule.appointment_type}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    {rule.availability_type === "specific"
                      ? `Fecha: ${rule.specific_date}`
                      : `${days.find((day) => day.value === rule.day_of_week)?.label ?? "Dia"} · ${rule.start_date ?? "sin inicio"} a ${rule.end_date ?? "sin fin"}`}
                    <br />
                    {rule.start_time} - {rule.end_time} · {rule.slot_duration_minutes} min · descanso {rule.break_minutes} min · cupos {rule.capacity_per_slot}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void updateAvailabilityRule(rule.id, { is_active: !rule.is_active }).then(load)}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold"
                  >
                    {rule.is_active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => void deleteAvailabilityRule(rule.id).then(load)} className="rounded-full border border-[var(--color-border)] p-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        />

        <AdminList
          title="Bloqueos"
          loading={loading}
          error={error}
          empty="Todavía no hay bloqueos."
          rows={blocks}
          render={(block) => (
            <div key={block.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{block.block_date} · {block.city ?? "Todas las ciudades"}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    {block.start_time ? `${block.start_time} - ${block.end_time}` : "Dia completo"}
                    <br />
                    {block.reason ?? "Sin motivo"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void updateAvailabilityBlock(block.id, { is_active: !block.is_active }).then(load)}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold"
                  >
                    {block.is_active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => void deleteAvailabilityBlock(block.id).then(load)} className="rounded-full border border-[var(--color-border)] p-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        />
      </section>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--color-copy)]">{label}</p>
        <span className="rounded-full bg-[rgba(198,162,123,0.16)] p-2 text-[var(--color-mocha)]">{icon}</span>
      </div>
      <p className="mt-4 font-display text-4xl font-semibold">{value}</p>
    </div>
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

function AdminList<T>({
  title,
  loading,
  error,
  empty,
  rows,
  render,
}: {
  title: string;
  loading: boolean;
  error: boolean;
  empty: string;
  rows: T[];
  render: (row: T) => ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] p-5">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-5 grid gap-3">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && rows.length === 0 && <EmptyState label={empty} />}
        {!loading && !error && rows.map(render)}
      </div>
    </div>
  );
}

function generatePreviewSlots(startTime?: string, endTime?: string, duration = 30, rest = 0) {
  if (!startTime || !endTime || startTime >= endTime || duration <= 0) return [];
  const slots: string[] = [];
  let cursor = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  const step = duration + Math.max(0, rest);

  while (cursor + duration <= end && slots.length < 24) {
    slots.push(`${timeFromMinutes(cursor)} - ${timeFromMinutes(cursor + duration)}`);
    cursor += step;
  }

  return slots;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number) {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
