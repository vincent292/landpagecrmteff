import { useMemo, useState, type ReactNode } from "react";

import { Star } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Seo } from "../../components/common/Seo";
import { boliviaCities } from "../../data/cities";
import { submitServiceFeedback, type ServiceFeedbackContextType } from "../../services/feedbackService";

export function PublicServiceFeedbackPage() {
  const [searchParams] = useSearchParams();
  const initialContextType = normalizeContextType(searchParams.get("tipo"));
  const initialTitle = searchParams.get("tratamiento") ?? searchParams.get("titulo") ?? "";
  const initialCity = searchParams.get("ciudad") ?? "";
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    patient_email: "",
    city: initialCity,
    treatment_name: initialTitle,
    context_type: initialContextType,
    rating: 5,
    would_recommend: true,
    comments: "",
  });

  const title = useMemo(() => form.treatment_name.trim() || "la atención recibida", [form.treatment_name]);

  const submit = async () => {
    if (form.rating < 1 || form.rating > 5) {
      setError("Elige una calificación de 1 a 5 estrellas.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitServiceFeedback({
        ...form,
        context_title: form.treatment_name,
        source: "public_feedback_page",
      });
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No pudimos guardar tu calificación.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 md:px-8 md:py-24">
      <Seo
        title="Calificar atención | Dra. Estefany Ballesteros"
        description="Formulario breve para evaluar la atención recibida y ayudarnos a mejorar."
        path="/calificar-atencion"
      />

      {submitted ? (
        <div className="mx-auto max-w-2xl rounded-[32px] border border-[var(--color-border)] bg-white/82 p-8 text-center shadow-[0_24px_80px_rgba(62,42,31,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Gracias</p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Tu calificación fue enviada.</h1>
          <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
            Tu opinión ayuda a mejorar la atención y revisar cada detalle del servicio.
          </p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Calificación de atención</p>
            <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.95] md:text-6xl">Cuéntanos cómo fue tu experiencia.</h1>
            <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
              Evalúa {title}. Es rápido y nos ayuda a corregir, mejorar y cuidar mejor cada atención.
            </p>
          </div>

          <div className="rounded-[32px] border border-[var(--color-border)] bg-white/82 p-5 shadow-[0_24px_80px_rgba(62,42,31,0.10)] sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <input value={form.patient_name} onChange={(event) => setForm((current) => ({ ...current, patient_name: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Celular">
                <input value={form.patient_phone} onChange={(event) => setForm((current) => ({ ...current, patient_phone: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Correo opcional">
                <input value={form.patient_email} onChange={(event) => setForm((current) => ({ ...current, patient_email: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Ciudad">
                <select value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="premium-input">
                  <option value="">Selecciona ciudad</option>
                  {boliviaCities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </Field>
              <Field label="Qué tratamiento o atención recibiste">
                <input value={form.treatment_name} onChange={(event) => setForm((current) => ({ ...current, treatment_name: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Tipo">
                <select
                  value={form.context_type}
                  onChange={(event) => setForm((current) => ({ ...current, context_type: normalizeContextType(event.target.value) }))}
                  className="premium-input"
                >
                  <option value="general">General</option>
                  <option value="treatment">Tratamiento</option>
                  <option value="promotion">Promoción</option>
                  <option value="appointment">Cita</option>
                  <option value="other">Otro</option>
                </select>
              </Field>
            </div>

            <div className="mt-6 rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5">
              <p className="text-sm font-semibold text-[var(--color-ink)]">Calificación</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, index) => {
                  const value = index + 1;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, rating: value }))}
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-full border ${
                        form.rating >= value
                          ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                          : "border-[var(--color-border)] bg-white text-[var(--color-copy)]"
                      }`}
                      aria-label={`${value} estrellas`}
                    >
                      <Star className={`h-5 w-5 ${form.rating >= value ? "fill-current" : ""}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <Field label="¿Recomendarías la atención?">
                <select
                  value={form.would_recommend ? "si" : "no"}
                  onChange={(event) => setForm((current) => ({ ...current, would_recommend: event.target.value === "si" }))}
                  className="premium-input"
                >
                  <option value="si">Sí</option>
                  <option value="no">No todavía</option>
                </select>
              </Field>
              <Field label="Comentario">
                <textarea
                  value={form.comments}
                  onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))}
                  className="premium-input min-h-32"
                  placeholder="Cuéntanos qué salió bien o qué podemos mejorar."
                />
              </Field>
            </div>

            {error ? <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p> : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="mt-6 w-full rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar calificación"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[var(--color-ink)]">{label}</span>
      {children}
    </label>
  );
}

function normalizeContextType(value?: string | null): ServiceFeedbackContextType {
  if (value === "treatment" || value === "promotion" || value === "appointment" || value === "other") return value;
  return "general";
}
