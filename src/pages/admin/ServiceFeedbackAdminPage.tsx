import { useEffect, useMemo, useState } from "react";

import { Copy, ExternalLink, Star } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getServiceFeedback, type ServiceFeedbackContextType, type ServiceFeedbackRow } from "../../services/feedbackService";
import { formatDate } from "../../utils/text";

type PeriodMode = "day" | "week" | "month" | "custom";

const contextLabels: Record<ServiceFeedbackContextType, string> = {
  general: "General",
  treatment: "Tratamiento",
  promotion: "Promoción",
  appointment: "Cita",
  other: "Otro",
};

export function ServiceFeedbackAdminPage() {
  const [rows, setRows] = useState<ServiceFeedbackRow[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [anchorDate, setAnchorDate] = useState(getLocalDateValue());
  const [customFrom, setCustomFrom] = useState(getLocalDateValue());
  const [customTo, setCustomTo] = useState(getLocalDateValue());
  const [contextFilter, setContextFilter] = useState<"all" | ServiceFeedbackContextType>("all");
  const [query, setQuery] = useState("");
  const [linkDraft, setLinkDraft] = useState({
    type: "general" as ServiceFeedbackContextType,
    title: "",
    city: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getServiceFeedback()
      .then(setRows)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No pudimos cargar calificaciones."))
      .finally(() => setLoading(false));
  }, []);

  const range = useMemo(
    () => getRange(periodMode, anchorDate, customFrom, customTo),
    [anchorDate, customFrom, customTo, periodMode]
  );

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      const date = toInputDate(row.created_at);
      const inRange = date >= range.from && date <= range.to;
      const contextMatches = contextFilter === "all" || row.context_type === contextFilter;
      const textMatches = !search || JSON.stringify([row.patient_name, row.treatment_name, row.context_title, row.city, row.comments]).toLowerCase().includes(search);
      return inRange && contextMatches && textMatches;
    });
  }, [contextFilter, query, range.from, range.to, rows]);

  const summary = useMemo(() => {
    const average = filteredRows.length
      ? filteredRows.reduce((sum, row) => sum + Number(row.rating ?? 0), 0) / filteredRows.length
      : null;
    return {
      total: filteredRows.length,
      average,
      promoters: filteredRows.filter((row) => row.would_recommend === true).length,
      low: filteredRows.filter((row) => row.rating <= 3).length,
    };
  }, [filteredRows]);

  const publicLink = useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const params = new URLSearchParams();
    if (linkDraft.type !== "general") params.set("tipo", linkDraft.type);
    if (linkDraft.title.trim()) params.set("tratamiento", linkDraft.title.trim());
    if (linkDraft.city.trim()) params.set("ciudad", linkDraft.city.trim());
    return `${origin}/calificar-atencion${params.toString() ? `?${params.toString()}` : ""}`;
  }, [linkDraft.city, linkDraft.title, linkDraft.type]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicLink);
    setMessage("Link copiado para enviar al paciente.");
  };

  if (loading) return <LoadingState label="Cargando calificaciones..." />;
  if (error) return <ErrorState label={error} />;

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Calificaciones</p>
            <h1 className="font-display mt-3 text-5xl font-semibold">Evaluación de atención</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
              Envía un link después de la atención o abre el formulario en el momento. El paciente elige el tratamiento y califica con estrellas.
            </p>
          </div>
          <a href={publicLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold">
            <ExternalLink className="h-4 w-4" />
            Abrir formulario
          </a>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[180px_1fr_180px_auto]">
          <select
            value={linkDraft.type}
            onChange={(event) => setLinkDraft((current) => ({ ...current, type: event.target.value as ServiceFeedbackContextType }))}
            className="premium-input"
          >
            {Object.entries(contextLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input
            value={linkDraft.title}
            onChange={(event) => setLinkDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Tratamiento, promoción o cita para precargar"
            className="premium-input"
          />
          <input
            value={linkDraft.city}
            onChange={(event) => setLinkDraft((current) => ({ ...current, city: event.target.value }))}
            placeholder="Ciudad"
            className="premium-input"
          />
          <button type="button" onClick={() => void copyLink()} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white">
            <Copy className="h-4 w-4" />
            Copiar link
          </button>
        </div>
        <p className="mt-3 break-all rounded-[18px] bg-[rgba(247,242,236,0.8)] px-4 py-3 text-xs text-[var(--color-copy)]">{publicLink}</p>
        {message ? <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary label="Respuestas" value={String(summary.total)} />
        <Summary label="Promedio" value={summary.average == null ? "Sin datos" : `${summary.average.toFixed(1)} / 5`} />
        <Summary label="Recomiendan" value={String(summary.promoters)} />
        <Summary label="Alertas <= 3" value={String(summary.low)} />
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_180px_180px_1fr]">
          <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)} className="premium-input">
            <option value="day">Diario</option>
            <option value="week">Semanal</option>
            <option value="month">Mensual</option>
            <option value="custom">Personalizado</option>
          </select>
          {periodMode === "custom" ? (
            <>
              <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="premium-input" />
              <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="premium-input" />
            </>
          ) : (
            <input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} className="premium-input md:col-span-2 xl:col-span-2" />
          )}
          <select value={contextFilter} onChange={(event) => setContextFilter(event.target.value as "all" | ServiceFeedbackContextType)} className="premium-input">
            <option value="all">Todo</option>
            {Object.entries(contextLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente, tratamiento o comentario" className="premium-input" />
        </div>
      </section>

      {filteredRows.length === 0 ? (
        <EmptyState label="No hay calificaciones para esos filtros." />
      ) : (
        <section className="grid gap-4">
          {filteredRows.map((row) => (
            <article key={row.id} className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                    {contextLabels[row.context_type]} · {formatDate(row.created_at)}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">{row.treatment_name ?? row.context_title ?? "Atención general"}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    {row.patient_name ?? "Paciente sin nombre"}{row.city ? ` · ${row.city}` : ""}{row.patient_phone ? ` · ${row.patient_phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-[rgba(216,194,174,0.22)] px-4 py-2 text-[var(--color-mocha)]">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className={`h-4 w-4 ${index < row.rating ? "fill-current" : ""}`} />
                  ))}
                  <span className="ml-2 text-sm font-semibold">{row.rating}/5</span>
                </div>
              </div>
              {row.comments ? <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">{row.comments}</p> : null}
              <p className="mt-3 text-xs font-semibold text-[var(--color-copy)]">
                {row.would_recommend == null ? "Sin respuesta de recomendación" : row.would_recommend ? "Sí recomendaría la atención" : "No recomendaría todavía"}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-copy)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function getRange(mode: PeriodMode, anchor: string, customFrom: string, customTo: string) {
  if (mode === "custom") {
    return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
  }
  const date = new Date(`${anchor}T00:00:00`);
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") {
    const day = date.getDay() || 7;
    const from = new Date(date);
    from.setDate(date.getDate() - day + 1);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toInputDate(from.toISOString()), to: toInputDate(to.toISOString()) };
  }
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toInputDate(from.toISOString()), to: toInputDate(to.toISOString()) };
}

function getLocalDateValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function toInputDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
