import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Link2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import {
  createPhotoComparison,
  getPatientPhotos,
  getPhotoComparisons,
  updatePhotoVisibility,
  uploadPatientPhoto,
} from "../../services/patientPhotoService";

const maxPhotoSize = 8 * 1024 * 1024;

const uploadSchema = z.object({
  photo_type: z.enum(["antes", "despues", "evolucion", "otro"]),
  treatment_name: z.string().optional(),
  notes: z.string().optional(),
  is_visible_to_patient: z.boolean(),
});

const comparisonSchema = z.object({
  before_photo_id: z.string().min(1, "Selecciona la foto antes"),
  after_photo_id: z.string().min(1, "Selecciona la foto despues"),
  treatment_name: z.string().min(2, "Escribe el tratamiento"),
  notes: z.string().optional(),
  is_visible_to_patient: z.boolean(),
});

type UploadValues = z.infer<typeof uploadSchema>;
type ComparisonValues = z.infer<typeof comparisonSchema>;

export function PatientPhotosPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof getPatientPhotos>>>([]);
  const [comparisons, setComparisons] = useState<Awaited<ReturnType<typeof getPhotoComparisons>>>([]);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [treatmentFilter, setTreatmentFilter] = useState("Todos");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creatingComparison, setCreatingComparison] = useState(false);
  const [state, setState] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const uploadForm = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      photo_type: "antes",
      treatment_name: "",
      notes: "",
      is_visible_to_patient: false,
    },
  });

  const comparisonForm = useForm<ComparisonValues>({
    resolver: zodResolver(comparisonSchema),
    defaultValues: {
      before_photo_id: "",
      after_photo_id: "",
      treatment_name: "",
      notes: "",
      is_visible_to_patient: false,
    },
  });

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [photoRows, comparisonRows] = await Promise.all([getPatientPhotos(id), getPhotoComparisons(id)]);
      setPhotos(photoRows);
      setComparisons(comparisonRows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const treatments = useMemo(
    () => [...new Set(photos.map((item) => item.treatment_name).filter(Boolean))] as string[],
    [photos]
  );

  const filtered = photos.filter((item) => {
    const typeOk = typeFilter === "Todos" || item.photo_type === typeFilter;
    const treatmentOk = treatmentFilter === "Todos" || item.treatment_name === treatmentFilter;
    return typeOk && treatmentOk;
  });

  const onFileChange = (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      setPreview("");
      return;
    }

    if (!nextFile.type.startsWith("image/")) {
      setState({ type: "error", text: "Solo se permiten imagenes." });
      return;
    }

    if (nextFile.size > maxPhotoSize) {
      setState({ type: "error", text: "La imagen supera el maximo de 8 MB." });
      return;
    }

    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    setState(null);
  };

  const upload = uploadForm.handleSubmit(async (values) => {
    if (!file) {
      setState({ type: "error", text: "Selecciona una imagen antes de subir." });
      return;
    }
    setUploading(true);
    setState(null);
    try {
      await uploadPatientPhoto(file, id, { ...values, uploaded_by: user?.id ?? null });
      setFile(null);
      setPreview("");
      uploadForm.reset();
      setState({ type: "success", text: "Foto subida correctamente." });
      await load();
    } catch {
      setState({ type: "error", text: "No pudimos subir la foto." });
    } finally {
      setUploading(false);
    }
  });

  const createComparisonRow = comparisonForm.handleSubmit(async (values) => {
    setCreatingComparison(true);
    setState(null);
    try {
      await createPhotoComparison({ ...values, patient_id: id });
      comparisonForm.reset();
      setState({ type: "success", text: "Comparacion guardada." });
      await load();
    } catch {
      setState({ type: "error", text: "No pudimos crear la comparacion." });
    } finally {
      setCreatingComparison(false);
    }
  });

  if (loading) return <LoadingState label="Cargando fotos clinicas..." />;
  if (error) return <ErrorState label="No pudimos cargar las fotos del paciente." />;

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <h1 className="font-display text-5xl font-semibold">Fotos antes, despues y evolucion</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
          Todas las imagenes se guardan en storage privado y se muestran con signed URLs temporales.
        </p>
        {state ? (
          <div className={`mt-5 rounded-[20px] p-4 text-sm ${state.type === "success" ? "bg-[rgba(111,122,96,0.12)] text-[var(--color-copy)]" : "bg-red-50 text-red-700"}`}>
            {state.text}
          </div>
        ) : null}

        <form onSubmit={upload} className="mt-6 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Archivo</span>
            <input type="file" accept="image/*" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} className="premium-input mt-2" />
          </label>
          <label>
            <span className="text-sm font-semibold">Tipo</span>
            <select {...uploadForm.register("photo_type")} className="premium-input mt-2">
              <option value="antes">Antes</option>
              <option value="despues">Despues</option>
              <option value="evolucion">Evolucion</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">Tratamiento relacionado</span>
            <input {...uploadForm.register("treatment_name")} className="premium-input mt-2" />
          </label>
          <label className="flex items-center gap-3 pt-7">
            <input type="checkbox" {...uploadForm.register("is_visible_to_patient")} />
            <span className="text-sm font-semibold">Visible para paciente</span>
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">Notas</span>
            <textarea {...uploadForm.register("notes")} className="premium-input mt-2 min-h-24" />
          </label>
          {preview ? (
            <div className="md:col-span-2 rounded-[24px] bg-[rgba(247,242,236,0.78)] p-4">
              <p className="text-sm font-semibold">Previsualizacion</p>
              <img src={preview} alt="Previsualizacion de subida" className="mt-3 h-72 w-full rounded-[18px] object-cover md:max-w-md" />
            </div>
          ) : null}
          <button disabled={uploading} className="w-fit rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            {uploading ? "Subiendo..." : "Subir foto"}
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <h2 className="text-xl font-semibold">Crear comparacion antes y despues</h2>
        <form onSubmit={createComparisonRow} className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Foto antes</span>
            <select {...comparisonForm.register("before_photo_id")} className="premium-input mt-2">
              <option value="">Selecciona foto antes</option>
              {photos.map((item) => <option key={item.id} value={item.id}>{item.photo_type} · {item.treatment_name ?? item.id}</option>)}
            </select>
            {comparisonForm.formState.errors.before_photo_id ? <span className="mt-1 block text-sm text-red-700">{comparisonForm.formState.errors.before_photo_id.message}</span> : null}
          </label>
          <label>
            <span className="text-sm font-semibold">Foto despues</span>
            <select {...comparisonForm.register("after_photo_id")} className="premium-input mt-2">
              <option value="">Selecciona foto despues</option>
              {photos.map((item) => <option key={item.id} value={item.id}>{item.photo_type} · {item.treatment_name ?? item.id}</option>)}
            </select>
            {comparisonForm.formState.errors.after_photo_id ? <span className="mt-1 block text-sm text-red-700">{comparisonForm.formState.errors.after_photo_id.message}</span> : null}
          </label>
          <label>
            <span className="text-sm font-semibold">Nombre del tratamiento</span>
            <input {...comparisonForm.register("treatment_name")} className="premium-input mt-2" />
            {comparisonForm.formState.errors.treatment_name ? <span className="mt-1 block text-sm text-red-700">{comparisonForm.formState.errors.treatment_name.message}</span> : null}
          </label>
          <label className="flex items-center gap-3 pt-7">
            <input type="checkbox" {...comparisonForm.register("is_visible_to_patient")} />
            <span className="text-sm font-semibold">Visible para paciente</span>
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">Notas</span>
            <textarea {...comparisonForm.register("notes")} className="premium-input mt-2 min-h-24" />
          </label>
          <button disabled={creatingComparison} className="w-fit rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
            {creatingComparison ? "Guardando..." : "Guardar comparacion"}
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="premium-input md:max-w-xs">
            <option>Todos</option>
            <option>antes</option>
            <option>despues</option>
            <option>evolucion</option>
            <option>otro</option>
          </select>
          <select value={treatmentFilter} onChange={(event) => setTreatmentFilter(event.target.value)} className="premium-input md:max-w-xs">
            <option>Todos</option>
            {treatments.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState label="No hay fotos para estos filtros." />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <div key={item.id} className="rounded-[24px] bg-[rgba(247,242,236,0.78)] p-4">
                <img src={item.signed_url ?? ""} alt={item.photo_type} className="h-60 w-full rounded-[18px] object-cover" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[rgba(184,138,90,0.16)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-mocha)]">
                    {item.photo_type}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.is_visible_to_patient ? "bg-[rgba(111,122,96,0.16)] text-[var(--color-copy)]" : "bg-[rgba(62,42,31,0.08)] text-[var(--color-copy)]"}`}>
                    {item.is_visible_to_patient ? "Visible para paciente" : "Privada"}
                  </span>
                </div>
                <p className="mt-3 font-semibold">{item.treatment_name ?? item.photo_type}</p>
                <p className="mt-2 text-sm text-[var(--color-copy)]">{item.notes ?? "Sin notas"}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(item.signed_url ?? "", "_blank", "noopener,noreferrer")}
                    className="rounded-full border border-[var(--color-border)] p-2"
                    aria-label="Abrir imagen temporal"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(item.signed_url ?? "")}
                    className="rounded-full border border-[var(--color-border)] p-2"
                    aria-label="Copiar URL temporal"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  <label className="ml-auto flex items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={item.is_visible_to_patient} onChange={(event) => void updatePhotoVisibility(item.id, event.target.checked).then(load)} />
                    Visible
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        {comparisons.length === 0 ? (
          <EmptyState label="Todavia no hay comparaciones antes y despues." />
        ) : (
          comparisons.map((item) => (
            <div key={item.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{item.treatment_name}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.is_visible_to_patient ? "bg-[rgba(111,122,96,0.16)] text-[var(--color-copy)]" : "bg-[rgba(184,138,90,0.16)] text-[var(--color-mocha)]"}`}>
                  {item.is_visible_to_patient ? "Visible para paciente" : "Privada"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Antes</p>
                  <img src={item.before_photo?.signed_url ?? ""} alt="Antes" className="h-56 w-full rounded-[18px] object-cover" />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Despues</p>
                  <img src={item.after_photo?.signed_url ?? ""} alt="Despues" className="h-56 w-full rounded-[18px] object-cover" />
                </div>
              </div>
              {item.notes ? <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">{item.notes}</p> : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
