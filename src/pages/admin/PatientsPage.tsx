import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { createPatient, getPatients, type PatientRow } from "../../services/patientService";
import { formatDate } from "../../utils/text";

const patientSchema = z.object({
  full_name: z.string().min(3, "Escribe el nombre completo"),
  phone: z.string().optional(),
  email: z.string().email("Correo invalido").or(z.literal("")),
  city: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

export function PatientsPage() {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: { full_name: "", phone: "", email: "", city: "" },
  });

  const load = () => {
    setLoading(true);
    setError(false);
    getPatients()
      .then(setRows)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const cities = useMemo(
    () => [...new Set(rows.map((item) => item.city).filter(Boolean))] as string[],
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((item) => {
        const queryMatch = JSON.stringify([item.full_name, item.phone, item.email]).toLowerCase().includes(query.toLowerCase());
        const cityMatch = city === "Todas" || item.city === city;
        return queryMatch && cityMatch;
      }),
    [city, query, rows]
  );

  const onSubmit = async (values: PatientFormValues) => {
    setSaving(true);
    await createPatient({
      ...values,
      email: values.email || null,
      phone: values.phone || null,
      city: values.city || null,
    });
    setSaving(false);
    setShowNew(false);
    reset();
    load();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Pacientes</p>
            <h1 className="font-display mt-3 text-5xl font-semibold">Base clínica de pacientes</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
              Un panel pensado para encontrar rápido a cada paciente, entrar a su ficha y continuar el seguimiento clínico sin perder contexto.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Nuevo paciente
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, celular o correo"
            className="premium-input"
          />
          <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input">
            <option value="Todas">Todas las ciudades</option>
            {cities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading && <LoadingState label="Cargando pacientes..." />}
      {error && <ErrorState label="No pudimos cargar los pacientes. Intenta de nuevo en un momento." />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState label={rows.length === 0 ? "Todavía no hay pacientes vinculados." : "No encontramos pacientes con esos filtros."} />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-[28px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-[var(--color-copy)]">
              <tr>
                <th className="py-3">Paciente</th>
                <th>Celular</th>
                <th>Correo</th>
                <th>Ciudad</th>
                <th>Registro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient) => (
                <tr key={patient.id} className="border-t border-[rgba(198,162,123,0.14)] align-top">
                  <td className="py-4">
                    <div className="font-medium text-[var(--color-ink)]">{patient.full_name}</div>
                    <div className="mt-2 inline-flex rounded-full bg-[rgba(216,194,174,0.24)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                      Paciente
                    </div>
                  </td>
                  <td>{patient.phone ?? "Sin celular"}</td>
                  <td>{patient.email ?? "Sin correo"}</td>
                  <td>{patient.city ?? "Sin ciudad"}</td>
                  <td>{formatDate(patient.created_at)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <PatientAction href={`/panel/pacientes/${patient.id}`} label="Ver ficha" />
                      <PatientAction href={`/panel/pacientes/${patient.id}/historia-clinica`} label="Historia" />
                      <PatientAction href={`/panel/pacientes/${patient.id}/fotos`} label="Fotos" />
                      <PatientAction href={`/panel/pacientes/${patient.id}/citas`} label="Citas" />
                      <PatientAction href={`/panel/pacientes/${patient.id}/recetas`} label="Recetas" />
                      <PatientAction href={`/panel/pacientes/${patient.id}/cuidados`} label="Cuidados" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit((values) => void onSubmit(values))}
            className="w-full max-w-2xl rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Nuevo paciente</p>
            <h2 className="font-display mt-3 text-4xl font-semibold">Crear ficha rápida</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Nombre completo" error={errors.full_name?.message}>
                <input {...register("full_name")} className="premium-input mt-2" />
              </Field>
              <Field label="Celular" error={errors.phone?.message}>
                <input {...register("phone")} className="premium-input mt-2" />
              </Field>
              <Field label="Correo" error={errors.email?.message}>
                <input {...register("email")} className="premium-input mt-2" />
              </Field>
              <Field label="Ciudad" error={errors.city?.message}>
                <input {...register("city")} className="premium-input mt-2" />
              </Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
                {saving ? "Guardando..." : "Guardar paciente"}
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PatientAction({ href, label }: { href: string; label: string }) {
  return (
    <Link to={href} className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)]">
      {label}
    </Link>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
