import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { createAppointment, getAppointmentsByPatient, updateAppointmentStatus } from "../../services/appointmentService";

export function PatientAppointmentsAdminPage() {
  const { id = "" } = useParams();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getAppointmentsByPatient>>>([]);
  const [form, setForm] = useState({
    title: "",
    appointment_date: "",
    start_time: "",
    end_time: "",
    city: "",
    location: "",
    status: "Programada",
    notes: "",
  });

  const load = () => void getAppointmentsByPatient(id).then(setItems);
  useEffect(load, [id]);

  const submit = async () => {
    await createAppointment({ ...form, patient_id: id });
    setForm({ title: "", appointment_date: "", start_time: "", end_time: "", city: "", location: "", status: "Programada", notes: "" });
    load();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Citas del paciente</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {Object.entries({
            title: "Titulo",
            appointment_date: "Fecha",
            start_time: "Hora inicio",
            end_time: "Hora fin",
            city: "Ciudad",
            location: "Lugar",
          }).map(([key, label]) => (
            <label key={key}>
              <span className="text-sm font-semibold">{label}</span>
              <input
                type={key.includes("date") ? "date" : key.includes("time") ? "time" : "text"}
                value={form[key as keyof typeof form]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                className="premium-input mt-2"
              />
            </label>
          ))}
          <label>
            <span className="text-sm font-semibold">Estado</span>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="premium-input mt-2">
              <option>Programada</option>
              <option>Confirmada</option>
              <option>Realizada</option>
              <option>Cancelada</option>
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">Notas</span>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="premium-input mt-2 min-h-24" />
          </label>
        </div>
        <button onClick={() => void submit()} className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          Guardar cita
        </button>
      </section>

      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <select value={item.status} onChange={(event) => void updateAppointmentStatus(item.id, event.target.value).then(load)} className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm">
                <option>Programada</option>
                <option>Confirmada</option>
                <option>Realizada</option>
                <option>Cancelada</option>
              </select>
            </div>
            <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
              Registrado por {item.profiles?.full_name ?? item.profiles?.email ?? "equipo medico"}
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{item.appointment_date} · {item.start_time} · {item.city}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
