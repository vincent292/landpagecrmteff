import { useEffect, useMemo, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, Eye, PauseCircle, Pencil, Plus, Save, Search } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { careModeOptions, getCareModeLabel } from "../../lib/careMode";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  getAvailabilityBlocks,
  getAvailabilityRules,
  updateAvailabilityBlock,
  updateAvailabilityRule,
  type AvailabilityBlockRow,
  type AvailabilityRuleRow,
} from "../../services/availabilityService";
import { getAdminDoctors, getMyDoctorProfile, type DoctorProfileRow } from "../../services/doctorService";
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

const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Promocion directa", "Revision postratamiento", "Consulta general"];

const ruleSchema = z
  .object({
    doctor_id: z.string().min(1, "Selecciona la doctora."),
    city: z.string().min(2, "La ciudad es obligatoria."),
    location: z.string().optional(),
    appointment_type: z.string().min(2, "El tipo de cita es obligatorio."),
    care_mode: z.enum(["presencial", "virtual", "ambas"]).default("presencial"),
    agenda_tag: z.string().optional(),
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
    doctor_id: z.string().optional(),
    city: z.string().optional(),
    block_mode: z.enum(["specific", "recurring"]).default("specific"),
    specific_date: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    days: z.array(z.number()).default([]),
    full_day: z.boolean().default(true),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    reason: z.string().optional(),
    is_active: z.boolean().default(true),
  })
  .refine((value) => value.block_mode !== "specific" || Boolean(value.specific_date), {
    message: "Elige la fecha del bloqueo.",
    path: ["specific_date"],
  })
  .refine((value) => value.block_mode !== "recurring" || Boolean(value.start_date), {
    message: "Elige la fecha de inicio.",
    path: ["start_date"],
  })
  .refine((value) => value.block_mode !== "recurring" || Boolean(value.end_date), {
    message: "Elige la fecha de fin.",
    path: ["end_date"],
  })
  .refine((value) => value.block_mode !== "recurring" || (value.start_date ?? "") <= (value.end_date ?? ""), {
    message: "La fecha de inicio debe ser menor o igual a la fecha de fin.",
    path: ["end_date"],
  })
  .refine((value) => value.block_mode !== "recurring" || value.days.length > 0, {
    message: "Elige al menos un dia para repetir el bloqueo.",
    path: ["days"],
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
type AvailabilityView = "new-rule" | "rules" | "new-block" | "blocks";

export function AvailabilityAdminPage() {
  const { profile, role, user } = useAuth();
  const [rules, setRules] = useState<AvailabilityRuleRow[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlockRow[]>([]);
  const [reservations, setReservations] = useState<AppointmentReservationRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [view, setView] = useState<AvailabilityView>("new-rule");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorPickerOpen, setDoctorPickerOpen] = useState(false);
  const [blockDoctorQuery, setBlockDoctorQuery] = useState("");
  const [blockDoctorPickerOpen, setBlockDoctorPickerOpen] = useState(false);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [doctorProfileName, setDoctorProfileName] = useState("");
  const [doctorProfileResolved, setDoctorProfileResolved] = useState(role !== "doctor");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const ruleForm = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema) as unknown as Resolver<RuleForm>,
    defaultValues: getDefaultRuleValues(),
  });

  const blockForm = useForm<BlockForm>({
    resolver: zodResolver(blockSchema) as unknown as Resolver<BlockForm>,
    defaultValues: getDefaultBlockValues(),
  });

  const watchedRule = ruleForm.watch();
  const watchedBlock = blockForm.watch();
  const previewSlots = useMemo(
    () =>
      generatePreviewSlots(
        watchedRule.start_time,
        watchedRule.end_time,
        Number(watchedRule.slot_duration_minutes),
        Number(watchedRule.break_minutes)
      ),
    [watchedRule.break_minutes, watchedRule.end_time, watchedRule.slot_duration_minutes, watchedRule.start_time]
  );
  const previewBlockDates = useMemo(
    () =>
      watchedBlock.block_mode === "recurring"
        ? generateRecurringBlockDates(watchedBlock.start_date, watchedBlock.end_date, watchedBlock.days ?? [])
        : watchedBlock.specific_date
          ? [watchedBlock.specific_date]
          : [],
    [watchedBlock.block_mode, watchedBlock.days, watchedBlock.end_date, watchedBlock.specific_date, watchedBlock.start_date]
  );

  const load = () => {
    if (role === "doctor" && !doctorProfileResolved) return;
    if (role === "doctor" && !doctorProfileId) {
      setRules([]);
      setBlocks([]);
      setReservations([]);
      setDoctors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    Promise.all([
      getAvailabilityRules(role === "superadmin", role === "doctor" ? doctorProfileId : null),
      getAvailabilityBlocks(role === "superadmin", role === "doctor" ? doctorProfileId : null),
      getReservationsAdmin(role === "doctor" ? { doctor_id: doctorProfileId } : {}, role === "superadmin", role),
      getAdminDoctors(role === "superadmin").then((rows) =>
        role === "doctor" && doctorProfileId ? rows.filter((doctor) => doctor.id === doctorProfileId) : rows
      ),
    ])
      .then(([nextRules, nextBlocks, nextReservations, nextDoctors]) => {
        setRules(nextRules);
        setBlocks(nextBlocks);
        setReservations(nextReservations);
        setDoctors(nextDoctors.filter((doctor) => doctor.is_active));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (role !== "doctor" || !profile?.id) {
      setDoctorProfileId(null);
      setDoctorProfileName("");
      setDoctorProfileResolved(true);
      return;
    }

    setDoctorProfileResolved(false);
    getMyDoctorProfile(profile.id)
      .then((doctor) => {
        setDoctorProfileId(doctor?.id ?? null);
        setDoctorProfileName(doctor?.full_name ?? "");
      })
      .catch(() => {
        setDoctorProfileId(null);
        setDoctorProfileName("");
      })
      .finally(() => setDoctorProfileResolved(true));
  }, [profile?.id, role]);

  useEffect(() => {
    load();
  }, [doctorProfileId, doctorProfileResolved, role]);

  const doctorFieldLocked = role === "doctor" && Boolean(doctorProfileId);

  useEffect(() => {
    if (doctors.length === 0) return;
    if (editingRuleId) return;

    const currentDoctorId = ruleForm.getValues("doctor_id");
    if (currentDoctorId && doctors.some((doctor) => doctor.id === currentDoctorId)) return;

    const ownDoctor = doctorFieldLocked
      ? doctors.find((doctor) => doctor.id === doctorProfileId)
      : doctors.find((doctor) => doctor.profile_id === profile?.id);
    const nextDoctor = ownDoctor ?? doctors[0];
    ruleForm.setValue("doctor_id", nextDoctor.id, { shouldValidate: true });
    setDoctorQuery(nextDoctor.full_name);
  }, [doctorFieldLocked, doctorProfileId, doctors, editingRuleId, profile?.id, ruleForm]);

  useEffect(() => {
    if (doctors.length === 0) return;
    if (editingBlockId) return;

    const currentDoctorId = blockForm.getValues("doctor_id");
    if (doctorFieldLocked) {
      const ownDoctor = doctors.find((doctor) => doctor.id === doctorProfileId);
      if (!ownDoctor) return;
      if (currentDoctorId !== ownDoctor.id) {
        blockForm.setValue("doctor_id", ownDoctor.id, { shouldValidate: false });
      }
      if (blockDoctorQuery !== ownDoctor.full_name) {
        setBlockDoctorQuery(ownDoctor.full_name);
      }
      return;
    }

    if (currentDoctorId && doctors.some((doctor) => doctor.id === currentDoctorId)) return;

    const ownDoctor = doctors.find((doctor) => doctor.profile_id === profile?.id);
    if (!ownDoctor) return;
    blockForm.setValue("doctor_id", ownDoctor.id, { shouldValidate: false });
    setBlockDoctorQuery(ownDoctor.full_name);
  }, [blockDoctorQuery, blockForm, doctorFieldLocked, doctorProfileId, doctors, editingBlockId, profile?.id]);

  const filteredDoctors = useMemo(() => {
    const normalizedQuery = normalizeSearchText(doctorQuery);
    if (!normalizedQuery) return doctors.slice(0, 8);
    return doctors.filter((doctor) => buildDoctorSearchIndex(doctor).includes(normalizedQuery)).slice(0, 8);
  }, [doctorQuery, doctors]);

  const filteredBlockDoctors = useMemo(() => {
    const normalizedQuery = normalizeSearchText(blockDoctorQuery);
    if (!normalizedQuery) return doctors.slice(0, 8);
    return doctors.filter((doctor) => buildDoctorSearchIndex(doctor).includes(normalizedQuery)).slice(0, 8);
  }, [blockDoctorQuery, doctors]);

  const futureRules = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rules
      .filter((rule) => {
        if (rule.availability_type === "specific") {
          return (rule.specific_date ?? "") >= today;
        }
        return !rule.end_date || rule.end_date >= today;
      })
      .sort((left, right) => getRuleSortDate(left).localeCompare(getRuleSortDate(right)));
  }, [rules]);

  const futureBlocks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return blocks
      .filter((block) => block.block_date >= today)
      .sort((left, right) => left.block_date.localeCompare(right.block_date));
  }, [blocks]);

  const pendingCount = reservations.filter((item) => item.status === "Pendiente").length;
  const confirmedCount = reservations.filter((item) => item.status === "Confirmada").length;

  const createOrUpdateRule = async (values: RuleForm) => {
    setSaving(true);
    setSuccess("");
    try {
      const common = {
        doctor_id: doctorFieldLocked ? doctorProfileId : values.doctor_id,
        created_by: profile?.id ?? null,
        city: values.city,
        location: values.location || null,
        appointment_type: values.appointment_type,
        care_mode: values.care_mode,
        agenda_tag: values.agenda_tag?.trim() || null,
        availability_type: values.availability_type,
        start_time: values.start_time,
        end_time: values.end_time,
        slot_duration_minutes: values.slot_duration_minutes,
        break_minutes: values.break_minutes,
        capacity_per_slot: values.capacity_per_slot,
        is_active: values.is_active,
      };

      if (editingRuleId) {
        await updateAvailabilityRule(editingRuleId, {
          ...common,
          specific_date: values.availability_type === "specific" ? values.specific_date : null,
          start_date: values.availability_type === "recurring" ? values.start_date || null : null,
          end_date: values.availability_type === "recurring" ? values.end_date || null : null,
          day_of_week: values.availability_type === "recurring" ? values.days[0] ?? null : null,
        });
        setSuccess("Disponibilidad actualizada correctamente.");
      } else if (values.availability_type === "specific") {
        await createAvailabilityRule({
          ...common,
          specific_date: values.specific_date,
          start_date: null,
          end_date: null,
          day_of_week: null,
        });
        setSuccess("Disponibilidad creada correctamente.");
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
        setSuccess("Disponibilidades creadas correctamente.");
      }

      cancelRuleEditing();
      load();
    } catch {
      setSuccess("");
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const createOrUpdateBlock = async (values: BlockForm) => {
    setSaving(true);
    setSuccess("");
    try {
      const basePayload = {
        created_by: profile?.id ?? null,
        doctor_id: doctorFieldLocked ? doctorProfileId : values.doctor_id || null,
        city: values.city || null,
        start_time: values.full_day ? null : values.start_time,
        end_time: values.full_day ? null : values.end_time,
        reason: values.reason?.trim() || null,
        is_active: values.is_active,
      };

      if (editingBlockId) {
        await updateAvailabilityBlock(editingBlockId, {
          ...basePayload,
          block_date: values.specific_date,
        });
        setSuccess("Bloqueo actualizado correctamente.");
      } else if (values.block_mode === "specific") {
        await createAvailabilityBlock({
          ...basePayload,
          block_date: values.specific_date,
        });
        setSuccess("Bloqueo guardado.");
      } else {
        const dates = generateRecurringBlockDates(values.start_date, values.end_date, values.days);
        if (dates.length === 0) {
          throw new Error("No se generaron fechas para el bloqueo.");
        }

        await Promise.all(
          dates.map((date) =>
            createAvailabilityBlock({
              ...basePayload,
              block_date: date,
            })
          )
        );
        setSuccess(dates.length === 1 ? "Bloqueo recurrente guardado." : `Se guardaron ${dates.length} bloqueos.`);
      }

      cancelBlockEditing();
      load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const beginRuleEdit = (rule: AvailabilityRuleRow) => {
    setEditingRuleId(rule.id);
    ruleForm.reset({
      doctor_id: rule.doctor_id ?? "",
      city: rule.city,
      location: rule.location ?? "",
      appointment_type: rule.appointment_type,
      care_mode: rule.care_mode ?? "presencial",
      agenda_tag: rule.agenda_tag ?? "",
      availability_type: rule.availability_type,
      start_date: rule.start_date ?? "",
      end_date: rule.end_date ?? "",
      specific_date: rule.specific_date ?? "",
      days: rule.day_of_week != null ? [rule.day_of_week] : [],
      start_time: normalizeTime(rule.start_time),
      end_time: normalizeTime(rule.end_time),
      slot_duration_minutes: rule.slot_duration_minutes,
      break_minutes: rule.break_minutes,
      capacity_per_slot: rule.capacity_per_slot,
      is_active: rule.is_active,
    });
    setDoctorQuery(rule.doctor_profiles?.full_name ?? "");
    setView("new-rule");
  };

  const beginBlockEdit = (block: AvailabilityBlockRow) => {
    setEditingBlockId(block.id);
    blockForm.reset({
      doctor_id: block.doctor_id ?? "",
      city: block.city ?? "",
      block_mode: "specific",
      specific_date: block.block_date,
      start_date: "",
      end_date: "",
      days: [],
      full_day: !block.start_time,
      start_time: normalizeTime(block.start_time),
      end_time: normalizeTime(block.end_time),
      reason: block.reason ?? "",
      is_active: block.is_active,
    });
    setBlockDoctorQuery(block.doctor_profiles?.full_name ?? "");
    setView("new-block");
  };

  const cancelRuleEditing = () => {
    setEditingRuleId(null);
    ruleForm.reset(getDefaultRuleValues());
    const ownDoctor = doctorFieldLocked
      ? doctors.find((doctor) => doctor.id === doctorProfileId)
      : doctors.find((doctor) => doctor.profile_id === profile?.id);
    const nextDoctor = ownDoctor ?? doctors[0];
    if (nextDoctor) {
      ruleForm.setValue("doctor_id", nextDoctor.id, { shouldValidate: true });
      setDoctorQuery(nextDoctor.full_name);
    } else {
      setDoctorQuery("");
    }
  };

  const cancelBlockEditing = () => {
    setEditingBlockId(null);
    blockForm.reset(getDefaultBlockValues());
    if (doctorFieldLocked && doctorProfileId) {
      blockForm.setValue("doctor_id", doctorProfileId, { shouldValidate: false });
      setBlockDoctorQuery(doctorProfileName);
      return;
    }
    setBlockDoctorQuery("");
  };

  const ruleCount = futureRules.length;
  const blockCount = futureBlocks.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
            Disponibilidad inteligente
          </p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Horarios sin choques</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Separamos disponibilidad y bloqueos en vistas claras para que administrar la agenda no se sienta saturado cuando el sistema crezca.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<CalendarDays className="h-5 w-5" />} label="Disponibilidades activas" value={ruleCount} />
        <SummaryCard icon={<PauseCircle className="h-5 w-5" />} label="Bloqueos desde hoy" value={blockCount} />
        <SummaryCard icon={<Clock className="h-5 w-5" />} label="Pendientes" value={pendingCount} />
        <SummaryCard icon={<Eye className="h-5 w-5" />} label="Confirmadas" value={confirmedCount} />
      </div>

      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-3 shadow-[0_20px_70px_rgba(62,42,31,0.07)] sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ViewCard
            label="Nueva disponibilidad"
            description="Crear o editar los horarios de atencion."
            value={editingRuleId ? "Editando" : "Formulario"}
            active={view === "new-rule"}
            onClick={() => setView("new-rule")}
          />
          <ViewCard
            label="Disponibilidades"
            description="Solo mostramos las reglas vigentes desde hoy."
            value={String(ruleCount)}
            active={view === "rules"}
            onClick={() => setView("rules")}
          />
          <ViewCard
            label="Nuevo bloqueo"
            description="Bloquea dias completos, tramos puntuales o repeticiones por rango."
            value={editingBlockId ? "Editando" : "Formulario"}
            active={view === "new-block"}
            onClick={() => setView("new-block")}
          />
          <ViewCard
            label="Bloqueos"
            description="Revisa los bloqueos futuros sin arrastrar historico viejo."
            value={String(blockCount)}
            active={view === "blocks"}
            onClick={() => setView("blocks")}
          />
        </div>
      </section>

      {success ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
          {success}
        </div>
      ) : null}

      {view === "new-rule" ? (
        <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <form onSubmit={ruleForm.handleSubmit(createOrUpdateRule)} className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_20px_70px_rgba(62,42,31,0.07)]">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-[rgba(198,162,123,0.16)] p-3 text-[var(--color-mocha)]">
                {editingRuleId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-2xl font-semibold">{editingRuleId ? "Editar disponibilidad" : "Crear disponibilidad"}</h2>
                <p className="text-sm text-[var(--color-copy)]">Busca la doctora como en citas y ajusta ese dia o ese bloque sin perder tiempo.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <DoctorCombobox
                label="Doctora"
                query={doctorQuery}
                open={doctorPickerOpen}
                doctors={filteredDoctors}
                error={ruleForm.formState.errors.doctor_id?.message}
                disabled={doctorFieldLocked}
                onFocus={() => setDoctorPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setDoctorPickerOpen(false), 120)}
                onChange={(value) => {
                  setDoctorQuery(value);
                  setDoctorPickerOpen(true);
                  ruleForm.setValue("doctor_id", "", { shouldValidate: true });
                }}
                onSelect={(doctor) => {
                  ruleForm.setValue("doctor_id", doctor.id, { shouldValidate: true });
                  setDoctorQuery(doctor.full_name);
                  setDoctorPickerOpen(false);
                }}
              />
              <Field label="Ciudad" error={ruleForm.formState.errors.city?.message}>
                <select {...ruleForm.register("city")} className="premium-input">
                  <option value="">Selecciona ciudad</option>
                  {boliviaCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ubicacion">
                <input {...ruleForm.register("location")} className="premium-input" placeholder="Clinica central" />
              </Field>
              <Field label="Tipo de cita" error={ruleForm.formState.errors.appointment_type?.message}>
                <select {...ruleForm.register("appointment_type")} className="premium-input">
                  {appointmentTypes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Atencion para">
                <select {...ruleForm.register("care_mode")} className="premium-input">
                  {careModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tag de agenda opcional">
                <input {...ruleForm.register("agenda_tag")} className="premium-input" placeholder="Ej: madres-mayo-2026" />
              </Field>
              <Field label="Frecuencia">
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
                    <p className="text-sm font-semibold">Dias de atencion</p>
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
                    {ruleForm.formState.errors.days?.message ? (
                      <p className="mt-2 text-xs text-red-700">{ruleForm.formState.errors.days.message}</p>
                    ) : null}
                  </div>
                </>
              )}

              <Field label="Hora inicio" error={ruleForm.formState.errors.start_time?.message}>
                <input type="time" {...ruleForm.register("start_time")} className="premium-input" />
              </Field>
              <Field label="Hora fin" error={ruleForm.formState.errors.end_time?.message}>
                <input type="time" {...ruleForm.register("end_time")} className="premium-input" />
              </Field>
              <Field label="Duracion por cita" error={ruleForm.formState.errors.slot_duration_minutes?.message}>
                <input type="number" {...ruleForm.register("slot_duration_minutes", { valueAsNumber: true })} className="premium-input" min={5} />
              </Field>
              <Field label="Descanso entre pacientes" error={ruleForm.formState.errors.break_minutes?.message}>
                <input type="number" {...ruleForm.register("break_minutes", { valueAsNumber: true })} className="premium-input" min={0} />
              </Field>
              <Field label="Cupos por horario" error={ruleForm.formState.errors.capacity_per_slot?.message}>
                <input type="number" {...ruleForm.register("capacity_per_slot", { valueAsNumber: true })} className="premium-input" min={1} />
              </Field>
              <label className="flex items-center gap-3 self-end rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 py-3 text-sm font-semibold">
                <input type="checkbox" {...ruleForm.register("is_active")} />
                Activo
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : editingRuleId ? "Guardar cambios" : "Guardar disponibilidad"}
              </button>
              {editingRuleId ? (
                <button type="button" onClick={cancelRuleEditing} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                  Cancelar edicion
                </button>
              ) : null}
            </div>
          </form>

          <aside className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.78)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              Vista previa
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Horarios que se generaran</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Si una misma franja servira para presencial y virtual, marca <strong className="text-[var(--color-ink)]">Presencial y virtual</strong>. Cuando se reserve uno, ese mismo horario ya no aparecera para la otra modalidad.
            </p>
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
          </aside>
        </section>
      ) : null}

      {view === "rules" ? (
        <section className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] p-5">
          <h2 className="text-2xl font-semibold">Disponibilidades vigentes</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            Solo mostramos fechas especificas desde hoy y reglas recurrentes que siguen vivas para no ensuciar la vista con historico pasado.
          </p>
          <div className="mt-5 grid gap-3">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState /> : null}
            {!loading && !error && futureRules.length === 0 ? <EmptyState label="No hay disponibilidades vigentes desde hoy." /> : null}
            {!loading && !error && futureRules.map((rule) => (
              <div key={rule.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {rule.doctor_profiles?.full_name ?? "Doctora sin asignar"} · {rule.city} · {rule.appointment_type}
                    </h3>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
                      {getCareModeLabel(rule.care_mode)}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      {rule.availability_type === "specific"
                        ? `Fecha: ${rule.specific_date}`
                        : `${days.find((day) => day.value === rule.day_of_week)?.label ?? "Dia"} · ${rule.start_date ?? "sin inicio"} a ${rule.end_date ?? "sin fin"}`}
                      <br />
                      {normalizeTime(rule.start_time)} - {normalizeTime(rule.end_time)} · {rule.slot_duration_minutes} min · descanso {rule.break_minutes} min · cupos {rule.capacity_per_slot}
                      {rule.agenda_tag ? ` · tag ${rule.agenda_tag}` : ""}
                    </p>
                    <DeletedStatusNote row={rule} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => beginRuleEdit(rule)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => void updateAvailabilityRule(rule.id, { is_active: !rule.is_active }).then(load)}
                      className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold"
                    >
                      {rule.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <DeleteActions
                      role={role}
                      row={rule}
                      compact
                      onSoftDelete={() =>
                        void softDeleteRecord({
                          table: "doctor_availability_rules",
                          id: rule.id,
                          actorId: profile?.id ?? user?.id ?? null,
                          actorRole: role,
                          actorName: profile?.full_name ?? user?.user_metadata.full_name ?? null,
                          actorEmail: profile?.email ?? user?.email ?? null,
                        }).then(load)
                      }
                      onRestore={() => void restoreRecord("doctor_availability_rules", rule.id).then(load)}
                      onHardDelete={() => void hardDeleteRecord("doctor_availability_rules", rule.id).then(load)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === "new-block" ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={blockForm.handleSubmit(createOrUpdateBlock)} className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_20px_70px_rgba(62,42,31,0.07)]">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-[rgba(198,162,123,0.16)] p-3 text-[var(--color-mocha)]">
                {editingBlockId ? <Pencil className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-2xl font-semibold">{editingBlockId ? "Editar bloqueo" : "Bloquear horario"}</h2>
                <p className="text-sm text-[var(--color-copy)]">Lo dejamos en una vista aparte para que viajes, pausas o cirugias no compitan con la carga de disponibilidades.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <DoctorCombobox
                label="Doctora opcional"
                query={blockDoctorQuery}
                open={blockDoctorPickerOpen}
                doctors={filteredBlockDoctors}
                disabled={doctorFieldLocked}
                onFocus={() => setBlockDoctorPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setBlockDoctorPickerOpen(false), 120)}
                onChange={(value) => {
                  setBlockDoctorQuery(value);
                  setBlockDoctorPickerOpen(true);
                  blockForm.setValue("doctor_id", "", { shouldValidate: false });
                }}
                onSelect={(doctor) => {
                  blockForm.setValue("doctor_id", doctor.id, { shouldValidate: false });
                  setBlockDoctorQuery(doctor.full_name);
                  setBlockDoctorPickerOpen(false);
                }}
                allowClear={!doctorFieldLocked}
                onClear={() => {
                  blockForm.setValue("doctor_id", "", { shouldValidate: false });
                  setBlockDoctorQuery("");
                  setBlockDoctorPickerOpen(false);
                }}
              />
              <Field label="Ciudad opcional">
                <select {...blockForm.register("city")} className="premium-input">
                  <option value="">Todas las ciudades</option>
                  {boliviaCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modalidad de bloqueo">
                <select {...blockForm.register("block_mode")} className="premium-input" disabled={Boolean(editingBlockId)}>
                  <option value="specific">Fecha especifica</option>
                  <option value="recurring">Repetir por rango y dias</option>
                </select>
              </Field>
              {watchedBlock.block_mode === "specific" ? (
                <Field label="Fecha" error={blockForm.formState.errors.specific_date?.message}>
                  <input type="date" {...blockForm.register("specific_date")} className="premium-input" />
                </Field>
              ) : (
                <>
                  <Field label="Fecha inicio" error={blockForm.formState.errors.start_date?.message}>
                    <input type="date" {...blockForm.register("start_date")} className="premium-input" disabled={Boolean(editingBlockId)} />
                  </Field>
                  <Field label="Fecha fin" error={blockForm.formState.errors.end_date?.message}>
                    <input type="date" {...blockForm.register("end_date")} className="premium-input" disabled={Boolean(editingBlockId)} />
                  </Field>
                  <div>
                    <p className="text-sm font-semibold">Dias a bloquear</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {days.map((day) => {
                        const selected = watchedBlock.days?.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            disabled={Boolean(editingBlockId)}
                            onClick={() => {
                              const current = blockForm.getValues("days") ?? [];
                              blockForm.setValue(
                                "days",
                                selected ? current.filter((item) => item !== day.value) : [...current, day.value],
                                { shouldValidate: true }
                              );
                            }}
                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                              selected ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white" : "border-[var(--color-border)] bg-white/70"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    {blockForm.formState.errors.days?.message ? (
                      <p className="mt-2 text-xs text-red-700">{blockForm.formState.errors.days.message}</p>
                    ) : null}
                  </div>
                </>
              )}
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" {...blockForm.register("full_day")} />
                Bloquear dia completo
              </label>
              {!watchedBlock.full_day ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Hora inicio" error={blockForm.formState.errors.start_time?.message}>
                    <input type="time" {...blockForm.register("start_time")} className="premium-input" />
                  </Field>
                  <Field label="Hora fin" error={blockForm.formState.errors.end_time?.message}>
                    <input type="time" {...blockForm.register("end_time")} className="premium-input" />
                  </Field>
                </div>
              ) : null}
              <Field label="Motivo">
                <textarea {...blockForm.register("reason")} className="premium-input min-h-24" />
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : editingBlockId ? "Guardar bloqueo" : "Guardar bloqueo"}
              </button>
              {editingBlockId ? (
                <button type="button" onClick={cancelBlockEditing} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                  Cancelar edicion
                </button>
              ) : null}
            </div>
          </form>

          <aside className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.78)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              Criterio visual
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Bloqueos mas claros</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Si el bloqueo es general, dejas doctora vacia. Si es puntual, marcas una fecha. Si se repite, eliges rango, dias y horario.
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-7 text-[var(--color-copy)]">
                <strong className="text-[var(--color-ink)]">Desde hoy en adelante:</strong> los bloqueos historicos ya no se muestran en la vista operativa.
              </div>
              <div className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-7 text-[var(--color-copy)]">
                <strong className="text-[var(--color-ink)]">Edicion:</strong> cuando crees un bloqueo recurrente se guardara como varias fechas para que luego puedas corregir cada una por separado.
              </div>
              <div className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-7 text-[var(--color-copy)]">
                <strong className="text-[var(--color-ink)]">Vista previa:</strong> {previewBlockDates.length === 0
                  ? "elige modalidad y fechas para ver lo que se bloqueara."
                  : previewBlockDates.length === 1
                    ? `se bloqueara ${previewBlockDates[0]}.`
                    : `se bloquearan ${previewBlockDates.length} fechas entre ${previewBlockDates[0]} y ${previewBlockDates[previewBlockDates.length - 1]}.`}
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {view === "blocks" ? (
        <section className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] p-5">
          <h2 className="text-2xl font-semibold">Bloqueos vigentes</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            Solo aparecen bloqueos desde hoy hacia adelante para que la recepcion no tenga que escanear semanas ya pasadas.
          </p>
          <div className="mt-5 grid gap-3">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState /> : null}
            {!loading && !error && futureBlocks.length === 0 ? <EmptyState label="No hay bloqueos futuros registrados." /> : null}
            {!loading && !error && futureBlocks.map((block) => (
              <div key={block.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {block.block_date} · {block.city ?? "Todas las ciudades"}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      {block.doctor_profiles?.full_name ? `${block.doctor_profiles.full_name} · ` : ""}
                      {block.start_time ? `${normalizeTime(block.start_time)} - ${normalizeTime(block.end_time)}` : "Dia completo"}
                      <br />
                      {block.reason ?? "Sin motivo"}
                    </p>
                    <DeletedStatusNote row={block} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => beginBlockEdit(block)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => void updateAvailabilityBlock(block.id, { is_active: !block.is_active }).then(load)}
                      className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold"
                    >
                      {block.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <DeleteActions
                      role={role}
                      row={block}
                      compact
                      onSoftDelete={() =>
                        void softDeleteRecord({
                          table: "availability_blocks",
                          id: block.id,
                          actorId: profile?.id ?? user?.id ?? null,
                          actorRole: role,
                          actorName: profile?.full_name ?? user?.user_metadata.full_name ?? null,
                          actorEmail: profile?.email ?? user?.email ?? null,
                        }).then(load)
                      }
                      onRestore={() => void restoreRecord("availability_blocks", block.id).then(load)}
                      onHardDelete={() => void hardDeleteRecord("availability_blocks", block.id).then(load)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
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

function ViewCard({
  label,
  description,
  value,
  active,
  onClick,
}: {
  label: string;
  description: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] px-5 py-4 text-left transition ${
        active ? "bg-[var(--color-mocha)] text-white shadow-[0_18px_35px_rgba(62,42,31,0.16)]" : "border border-[var(--color-border)] bg-[rgba(247,242,236,0.75)] text-[var(--color-ink)]"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-2 text-sm opacity-80">{description}</p>
    </button>
  );
}

function DoctorCombobox({
  label,
  query,
  open,
  doctors,
  error,
  onFocus,
  onBlur,
  onChange,
  onSelect,
  disabled = false,
  allowClear = false,
  onClear,
}: {
  label: string;
  query: string;
  open: boolean;
  doctors: DoctorProfileRow[];
  error?: string;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onSelect: (doctor: DoctorProfileRow) => void;
  disabled?: boolean;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
          <input
            value={query}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Escribe para buscar doctora"
            className="premium-input !pl-12"
            disabled={disabled}
          />
        </div>
        {!disabled && open ? (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-[0_18px_45px_rgba(62,42,31,0.12)]">
            <div className="max-h-72 overflow-y-auto p-2">
              {allowClear && onClear ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onClear}
                  className="flex w-full flex-col rounded-[18px] px-4 py-3 text-left transition hover:bg-[rgba(247,242,236,0.82)]"
                >
                  <span className="text-sm font-semibold text-[var(--color-ink)]">Sin doctora especifica</span>
                  <span className="mt-1 text-xs text-[var(--color-copy)]">Aplicar a todas o dejar el bloqueo general.</span>
                </button>
              ) : null}
              {doctors.map((doctor) => (
                <button
                  type="button"
                  key={doctor.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(doctor)}
                  className="flex w-full flex-col rounded-[18px] px-4 py-3 text-left transition hover:bg-[rgba(247,242,236,0.82)]"
                >
                  <span className="text-sm font-semibold text-[var(--color-ink)]">{doctor.full_name}</span>
                  <span className="mt-1 text-xs text-[var(--color-copy)]">{doctor.specialty ?? "Doctora"} · {doctor.city ?? "sin ciudad"}</span>
                </button>
              ))}
              {doctors.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--color-copy)]">No encontramos doctoras con ese nombre.</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Field>
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

function getDefaultRuleValues(): RuleForm {
  return {
    doctor_id: "",
    city: "Cochabamba",
    location: "",
    appointment_type: "Valoracion estetica",
    care_mode: "presencial",
    agenda_tag: "",
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
  };
}

function getDefaultBlockValues(): BlockForm {
  return {
    doctor_id: "",
    city: "",
    block_mode: "specific",
    specific_date: "",
    start_date: "",
    end_date: "",
    days: [1],
    full_day: true,
    start_time: "",
    end_time: "",
    reason: "",
    is_active: true,
  };
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

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildDoctorSearchIndex(doctor: DoctorProfileRow) {
  return normalizeSearchText([doctor.full_name, doctor.specialty, doctor.city, doctor.email].filter(Boolean).join(" "));
}

function normalizeTime(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function getRuleSortDate(rule: AvailabilityRuleRow) {
  const today = new Date().toISOString().slice(0, 10);
  if (rule.availability_type === "specific") return rule.specific_date ?? today;
  if (rule.start_date && rule.start_date > today) return rule.start_date;
  return today;
}

function generateRecurringBlockDates(startDate?: string, endDate?: string, selectedDays: number[] = []) {
  if (!startDate || !endDate || startDate > endDate || selectedDays.length === 0) return [];

  const allowedDays = new Set(selectedDays);
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const dates: string[] = [];

  while (cursor <= end && dates.length < 366) {
    if (allowedDays.has(cursor.getDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
