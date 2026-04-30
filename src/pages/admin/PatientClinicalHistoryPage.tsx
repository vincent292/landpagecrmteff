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
  getClinicalHistoryByPatient,
  updateClinicalHistory,
} from "../../services/clinicalHistoryService";
import { formatDate } from "../../utils/text";

const historySchema = z.object({
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
  title: z.string().min(3, "Escribe un título"),
  description: z.string().min(6, "Describe la evolución"),
  treatment_performed: z.string().optional(),
  recommendations: z.string().optional(),
});

type HistoryValues = z.infer<typeof historySchema>;
type EvolutionValues = z.infer<typeof evolutionSchema>;

const emptyHistory: HistoryValues = {
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
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
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
      const [history, evolutionRows] = await Promise.all([
        getClinicalHistoryByPatient(id),
        getClinicalEvolutions(id),
      ]);

      if (history) {
        setHistoryId(history.id);
        setUpdatedAt(history.updated_at);
        historyForm.reset({
          reason_for_consultation: history.reason_for_consultation ?? "",
          medical_history: history.medical_history ?? "",
          allergies: history.allergies ?? "",
          current_medications: history.current_medications ?? "",
          previous_procedures: history.previous_procedures ?? "",
          diagnosis: history.diagnosis ?? "",
          observations: history.observations ?? "",
          internal_notes: history.internal_notes ?? "",
        });
      }
      setEvolutions(evolutionRows);
    } catch {
      setStatus({ type: "error", text: "No pudimos cargar la historia clínica." });
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
      if (historyId) {
        const updated = await updateClinicalHistory(historyId, values);
        setUpdatedAt(updated.updated_at);
      } else {
        const created = await createClinicalHistory({ ...values, patient_id: id, created_by: user?.id ?? null });
        setHistoryId(created.id);
        setUpdatedAt(created.updated_at);
      }
      setStatus({ type: "success", text: "Historia clínica guardada correctamente." });
    } catch {
      setStatus({ type: "error", text: "No pudimos guardar los cambios." });
    } finally {
      setSavingHistory(false);
    }
  });

  const saveEvolution = evolutionForm.handleSubmit(async (values) => {
    setSavingEvolution(true);
    setStatus(null);
    try {
      await createClinicalEvolution({
        ...values,
        patient_id: id,
        clinical_history_id: historyId,
        created_by: user?.id ?? null,
      });
      evolutionForm.reset();
      setStatus({ type: "success", text: "Evolucion registrada." });
      await load();
    } catch {
      setStatus({ type: "error", text: "No pudimos registrar la evolución." });
    } finally {
      setSavingEvolution(false);
    }
  });

  if (loading) return <LoadingState label="Cargando historia clínica..." />;

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Historia clínica</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-5xl font-semibold">Evaluación médica y seguimiento</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Organizada por secciones para que el criterio clínico y la documentación se lean con calma.
            </p>
          </div>
          {updatedAt ? (
            <div className="rounded-full bg-[rgba(216,194,174,0.24)] px-4 py-2 text-xs font-semibold text-[var(--color-mocha)]">
              Ultima actualizacion: {formatDate(updatedAt)}
            </div>
          ) : null}
        </div>

        {status ? (
          <div className={`mt-6 rounded-[20px] p-4 text-sm ${status.type === "success" ? "bg-[rgba(111,122,96,0.12)] text-[var(--color-copy)]" : "bg-red-50 text-red-700"}`}>
            {status.text}
          </div>
        ) : null}

        <form onSubmit={saveHistory} className="mt-8 grid gap-5">
          {[
            ["Motivo de consulta", "reason_for_consultation"],
            ["Antecedentes médicos", "medical_history"],
            ["Alergias", "allergies"],
            ["Medicamentos actuales", "current_medications"],
            ["Procedimientos previos", "previous_procedures"],
            ["Diagnostico", "diagnosis"],
            ["Observaciones", "observations"],
            ["Notas internas", "internal_notes"],
          ].map(([label, key]) => (
            <label key={key}>
              <span className="text-sm font-semibold">{label}</span>
              <textarea {...historyForm.register(key as keyof HistoryValues)} className="premium-input mt-2 min-h-28" />
              {historyForm.formState.errors[key as keyof HistoryValues] ? (
                <span className="mt-1 block text-sm text-red-700">
                  {historyForm.formState.errors[key as keyof HistoryValues]?.message}
                </span>
              ) : null}
            </label>
          ))}

          <button disabled={savingHistory} className="mt-2 w-fit rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            {savingHistory ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <h2 className="text-xl font-semibold">Evoluciones clínicas</h2>
        <form onSubmit={saveEvolution} className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Titulo</span>
            <input {...evolutionForm.register("title")} className="premium-input mt-2" />
            {evolutionForm.formState.errors.title ? <span className="mt-1 block text-sm text-red-700">{evolutionForm.formState.errors.title.message}</span> : null}
          </label>
          <label>
            <span className="text-sm font-semibold">Tratamiento realizado</span>
            <input {...evolutionForm.register("treatment_performed")} className="premium-input mt-2" />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">Descripcion</span>
            <textarea {...evolutionForm.register("description")} className="premium-input mt-2 min-h-24" />
            {evolutionForm.formState.errors.description ? <span className="mt-1 block text-sm text-red-700">{evolutionForm.formState.errors.description.message}</span> : null}
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">Recomendaciones</span>
            <textarea {...evolutionForm.register("recommendations")} className="premium-input mt-2 min-h-24" />
          </label>
          <button disabled={savingEvolution} className="w-fit rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
            {savingEvolution ? "Guardando..." : "Registrar evolución"}
          </button>
        </form>

        <div className="mt-8 space-y-4">
          {evolutions.length === 0 ? (
            <EmptyState label="Todavía no hay evoluciones clínicas registradas." />
          ) : (
            evolutions.map((item) => (
              <div key={item.id} className="relative rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5 pl-8">
                <div className="absolute left-4 top-6 h-2.5 w-2.5 rounded-full bg-[var(--color-mocha)]" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{formatDate(item.created_at)}</p>
                <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
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
