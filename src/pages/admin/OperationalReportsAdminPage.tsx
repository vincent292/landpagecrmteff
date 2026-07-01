import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BarChart3, Download, Star } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getMyDoctorProfile } from "../../services/doctorService";
import {
  getOperationalReportData,
  type OperationalEvent,
  type OperationalEventType,
} from "../../services/operationalReportService";
import { formatDate, formatMoney } from "../../utils/text";

type PeriodMode = "day" | "week" | "month" | "custom";
type TypeFilter = "all" | OperationalEventType;

const typeOptions: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "appointment", label: "Citas" },
  { value: "treatment", label: "Tratamientos" },
  { value: "promotion", label: "Promociones" },
  { value: "request", label: "Solicitudes" },
  { value: "feedback", label: "Calificaciones" },
];

const typeLabels: Record<OperationalEventType, string> = {
  appointment: "Cita",
  treatment: "Tratamiento",
  promotion: "Promoción",
  request: "Solicitud",
  feedback: "Calificación",
};

export function OperationalReportsAdminPage() {
  const { role, user } = useAuth();
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [anchorDate, setAnchorDate] = useState(getLocalDateValue());
  const [customFrom, setCustomFrom] = useState(getLocalDateValue());
  const [customTo, setCustomTo] = useState(getLocalDateValue());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const doctorProfile = user?.id ? await getMyDoctorProfile(user.id).catch(() => null) : null;
      const rows = await getOperationalReportData({
        role,
        doctorProfileId: doctorProfile?.id ?? null,
      });
      setEvents(rows);
    };

    void load()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No pudimos cargar el resumen operativo."))
      .finally(() => setLoading(false));
  }, [role, user?.id]);

  const range = useMemo(
    () => getRange(periodMode, anchorDate, customFrom, customTo),
    [anchorDate, customFrom, customTo, periodMode]
  );

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();
    return events.filter((event) => {
      const eventDate = toInputDate(event.date);
      const inRange = eventDate >= range.from && eventDate <= range.to;
      const typeMatches = typeFilter === "all" || event.type === typeFilter;
      const textMatches = !search || JSON.stringify([event.title, event.patientName, event.city, event.status, event.source]).toLowerCase().includes(search);
      return inRange && typeMatches && textMatches;
    });
  }, [events, query, range.from, range.to, typeFilter]);

  const summary = useMemo(() => {
    const totalAmount = filteredEvents.reduce((sum, event) => sum + Number(event.amount ?? 0), 0);
    const ratings = filteredEvents.map((event) => event.rating).filter((rating): rating is number => typeof rating === "number");

    return {
      total: filteredEvents.length,
      appointments: filteredEvents.filter((event) => event.type === "appointment").length,
      treatments: filteredEvents.filter((event) => event.type === "treatment").length,
      promotions: filteredEvents.filter((event) => event.type === "promotion").length,
      requests: filteredEvents.filter((event) => event.type === "request").length,
      feedback: filteredEvents.filter((event) => event.type === "feedback").length,
      totalAmount,
      averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    };
  }, [filteredEvents]);

  if (loading) return <LoadingState label="Cargando resumen operativo..." />;
  if (error) return <ErrorState label={error} />;

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Resumen operativo</p>
            <h1 className="font-display mt-3 text-5xl font-semibold">Procedimientos, citas y actividad</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
              Vista diaria, semanal, mensual o por rango de lo que se agenda, vende, realiza y califica. No reemplaza caja ni inventario; es control operativo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportOperationalCsv(filteredEvents)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_180px_1fr]">
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
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar paciente, tratamiento, ciudad o estado"
            className="premium-input"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {typeOptions.map((option) => {
            const count = option.value === "all" ? filteredEvents.length : filteredEvents.filter((event) => event.type === option.value).length;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTypeFilter(option.value)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  typeFilter === option.value
                    ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                    : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                }`}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total actividad" value={String(summary.total)} />
        <SummaryCard label="Tratamientos/procedimientos" value={String(summary.treatments)} />
        <SummaryCard label="Citas" value={String(summary.appointments)} />
        <SummaryCard label="Promociones" value={String(summary.promotions)} />
        <SummaryCard label="Solicitudes" value={String(summary.requests)} />
        <SummaryCard label="Calificaciones" value={String(summary.feedback)} />
        <SummaryCard label="Monto ligado" value={formatMoney(summary.totalAmount)} />
        <SummaryCard label="Promedio atención" value={summary.averageRating == null ? "Sin datos" : `${summary.averageRating.toFixed(1)} / 5`} icon={<Star className="h-4 w-4" />} />
      </section>

      {filteredEvents.length === 0 ? (
        <EmptyState label="No hay actividad para esos filtros." />
      ) : (
        <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-[var(--color-copy)]">
                <tr>
                  <th className="py-3">Fecha</th>
                  <th>Tipo</th>
                  <th>Detalle</th>
                  <th>Paciente</th>
                  <th>Ciudad</th>
                  <th>Estado</th>
                  <th>Monto</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="border-t border-[rgba(198,162,123,0.14)]">
                    <td className="py-4">{formatDate(event.date)}</td>
                    <td>
                      <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                        {typeLabels[event.type]}
                      </span>
                    </td>
                    <td>
                      <p className="font-semibold text-[var(--color-ink)]">{event.title}</p>
                      <p className="mt-1 text-xs text-[var(--color-copy)]">{event.source}</p>
                    </td>
                    <td>{event.patientName ?? "Sin paciente"}</td>
                    <td>{event.city ?? "Sin ciudad"}</td>
                    <td>{event.status}</td>
                    <td>{event.amount > 0 ? formatMoney(event.amount) : "-"}</td>
                    <td>{event.rating ? `${event.rating}/5` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <div className="flex items-center gap-2 text-[var(--color-accent-strong)]">
        {icon ?? <BarChart3 className="h-4 w-4" />}
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-copy)]">{label}</p>
      </div>
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

function exportOperationalCsv(events: OperationalEvent[]) {
  const headers = ["fecha", "tipo", "detalle", "paciente", "ciudad", "estado", "monto", "rating", "origen", "notas"];
  const rows = events.map((event) => [
    toInputDate(event.date),
    typeLabels[event.type],
    event.title,
    event.patientName ?? "",
    event.city ?? "",
    event.status,
    String(event.amount ?? 0),
    event.rating == null ? "" : String(event.rating),
    event.source,
    event.notes ?? "",
  ]);
  downloadCsv(`resumen-operativo-${getLocalDateValue()}.csv`, [headers, ...rows]);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
