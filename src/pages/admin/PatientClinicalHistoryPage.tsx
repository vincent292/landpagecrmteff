import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import {
  createClinicalEvolution,
  createClinicalHistory,
  getClinicalEvolutions,
  getClinicalHistoriesByPatient,
} from "../../services/clinicalHistoryService";
import { formatDate } from "../../utils/text";

const historySchema = z.object({
  session_title: z.string().min(3, "Escribe un titulo para esta atencion"),
  session_date: z.string().min(1, "Selecciona la fecha"),
  reason_for_consultation: z.string().min(3, "Describe el motivo de consulta"),
  medical_history: z.string().optional(),
  allergies: z.string().optional(),
  current_medications: z.string().optional(),
  previous_procedures: z.string().optional(),
  diagnosis: z.string().min(3, "Escribe un diagnostico base"),
  observations: z.string().optional(),
  internal_notes: z.string().optional(),
});

const evolutionSchema = z.object({
  title: z.string().min(3, "Escribe un titulo"),
  description: z.string().min(6, "Describe la evolucion"),
  treatment_performed: z.string().optional(),
  recommendations: z.string().optional(),
});

type HistoryValues = z.infer<typeof historySchema>;
type EvolutionValues = z.infer<typeof evolutionSchema>;

const emptyHistory: HistoryValues = {
  session_title: "",
  session_date: new Date().toISOString().slice(0, 10),
  reason_for_consultation: "",
  medical_history: "",
  allergies: "",
  current_medications: "",
  previous_procedures: "",
  diagnosis: "",
  observations: "",
  internal_notes: "",
};

export function PatientClinicalHistoryPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [histories, setHistories] = useState<Awaited<ReturnType<typeof getClinicalHistoriesByPatient>>>([]);
  const [evolutions, setEvolutions] = useState<Awaited<ReturnType<typeof getClinicalEvolutions>>>([]);
  const [loading, setLoading] = useState(true);
  const [savingHistory, setSavingHistory] = useState(false);
  const [savingEvolution, setSavingEvolution] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const historyForm = useForm<HistoryValues>({
    resolver: zodResolver(historySchema),
    defaultValues: emptyHistory,
  });

  const evolutionForm = useForm<EvolutionValues>({
    resolver: zodResolver(evolutionSchema),
    defaultValues: {
      title: "",
      description: "",
      treatment_performed: "",
      recommendations: "",
    },
  });

  const load = async () => {
    setLoading(true);
    try {
      const [historyRows, evolutionRows] = await Promise.all([
        getClinicalHistoriesByPatient(id),
        getClinicalEvolutions(id),
      ]);
      setHistories(historyRows);
      setEvolutions(evolutionRows);
    } catch {
      setStatus({ type: "error", text: "No pudimos cargar la historia clinica." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const saveHistory = historyForm.handleSubmit(async (values) => {
    setSavingHistory(true);
    setStatus(null);
    try {
      await createClinicalHistory({ ...values, patient_id: id, created_by: user?.id ?? null });
      historyForm.reset(emptyHistory);
      await load();
      setStatus({ type: "success", text: "Nueva atencion clinica guardada correctamente." });
    } catch {
      setStatus({ type: "error", text: "No pudimos guardar la atencion." });
    } finally {
      setSavingHistory(false);
    }
  });

  const latestHistoryId = histories[0]?.id ?? null;

  const saveEvolution = evolutionForm.handleSubmit(async (values) => {
    setSavingEvolution(true);
    setStatus(null);
    try {
      await createClinicalEvolution({
        ...values,
        patient_id: id,
        clinical_history_id: latestHistoryId,
        created_by: user?.id ?? null,
      });
      evolutionForm.reset();
      setStatus({ type: "success", text: "Evolucion registrada." });
      await load();
    } catch {
      setStatus({ type: "error", text: "No pudimos registrar la evolucion." });
    } finally {
      setSavingEvolution(false);
    }
  });

  if (loading) return <LoadingState label="Cargando historia clinica..." />;

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Historia clinica
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-5xl font-semibold">Nueva atencion medica</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Cada visita se guarda como un registro nuevo. Las atenciones anteriores quedan intactas para lectura y trazabilidad.
            </p>
          </div>
        </div>

        {status ? (
          <div className={`mt-6 rounded-[20px] p-4 text-sm ${status.type === "success" ? "bg-[rgba(111,122,96,0.12)] text-[var(--color-copy)]" : "bg-red-50 text-red-700"}`}>
            {status.text}
          </div>
        ) : null}

        <form onSubmit={saveHistory} className="mt-8 grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Titulo de atencion" error={historyForm.formState.errors.session_title?.message}>
              <input {...historyForm.register("session_title")} className="premium-input" />
            </Field>
            <Field label="Fecha" error={historyForm.formState.errors.session_date?.message}>
              <input type="date" {...historyForm.register("session_date")} className="premium-input" />
            </Field>
          </div>

          {[
            ["Motivo de consulta", "reason_for_consultation"],
            ["Antecedentes medicos", "medical_history"],
            ["Alergias", "allergies"],
            ["Medicamentos actuales", "current_medications"],
            ["Procedimientos previos", "previous_procedures"],
            ["Diagnostico", "diagnosis"],
            ["Observaciones", "observations"],
            ["Notas internas", "internal_notes"],
          ].map(([label, key]) => (
            <Field key={key} label={label} error={historyForm.formState.errors[key as keyof HistoryValues]?.message}>
              <textarea {...historyForm.register(key as keyof HistoryValues)} className="premium-input min-h-28" />
            </Field>
          ))}

          <button disabled={savingHistory} className="mt-2 w-fit rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            {savingHistory ? "Guardando..." : "Guardar nueva atencion"}
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <h2 className="text-xl font-semibold">Historial de atenciones</h2>
        <div className="mt-5 grid gap-4">
          {histories.length === 0 ? (
            <EmptyState label="Todavia no hay atenciones guardadas." />
          ) : (
            histories.map((item, index) => (
              <article key={item.id} className="rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  Atencion {histories.length - index} · {formatDate(item.session_date ?? item.created_at)}
                </p>
                <h3 className="mt-2 text-lg font-semibold">{item.session_title ?? item.reason_for_consultation}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
                  Registrado por {item.profiles?.full_name ?? item.profiles?.email ?? "equipo medico"}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  <strong>Motivo:</strong> {item.reason_for_consultation}
                  <br />
                  <strong>Diagnostico:</strong> {item.diagnosis}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <h2 className="text-xl font-semibold">Evoluciones clinicas</h2>
        <form onSubmit={saveEvolution} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Titulo" error={evolutionForm.formState.errors.title?.message}>
            <input {...evolutionForm.register("title")} className="premium-input" />
          </Field>
          <Field label="Tratamiento realizado">
            <input {...evolutionForm.register("treatment_performed")} className="premium-input" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Descripcion" error={evolutionForm.formState.errors.description?.message}>
              <textarea {...evolutionForm.register("description")} className="premium-input min-h-24" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Recomendaciones">
              <textarea {...evolutionForm.register("recommendations")} className="premium-input min-h-24" />
            </Field>
          </div>
          <button disabled={savingEvolution} className="w-fit rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
            {savingEvolution ? "Guardando..." : "Registrar evolucion"}
          </button>
        </form>

        <div className="mt-8 space-y-4">
          {evolutions.length === 0 ? (
            <EmptyState label="Todavia no hay evoluciones clinicas registradas." />
          ) : (
            evolutions.map((item) => (
              <div key={item.id} className="relative rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5 pl-8">
                <div className="absolute left-4 top-6 h-2.5 w-2.5 rounded-full bg-[var(--color-mocha)]" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{formatDate(item.created_at)}</p>
                <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
                  Registrado por {item.profiles?.full_name ?? item.profiles?.email ?? "equipo medico"}
                </p>
                {item.treatment_performed ? <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">{item.treatment_performed}</p> : null}
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{item.description}</p>
                {item.recommendations ? <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]"><strong>Recomendaciones:</strong> {item.recommendations}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}
