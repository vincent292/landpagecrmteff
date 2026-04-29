import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { createPostTreatmentCare, getPostCaresByPatient } from "../../services/postCareService";

export function PatientCaresAdminPage() {
  const { id = "" } = useParams();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getPostCaresByPatient>>>([]);
  const [form, setForm] = useState({
    title: "",
    treatment_name: "",
    care_instructions: "",
    warning_signs: "",
    next_steps: "",
    is_visible_to_patient: true,
  });

  const load = () => void getPostCaresByPatient(id).then(setItems);
  useEffect(load, [id]);

  const submit = async () => {
    await createPostTreatmentCare({ ...form, patient_id: id });
    setForm({ title: "", treatment_name: "", care_instructions: "", warning_signs: "", next_steps: "", is_visible_to_patient: true });
    load();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Cuidados postratamiento</h1>
        <div className="mt-6 grid gap-4">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="premium-input" placeholder="Titulo" />
          <input value={form.treatment_name} onChange={(event) => setForm({ ...form, treatment_name: event.target.value })} className="premium-input" placeholder="Tratamiento" />
          <textarea value={form.care_instructions} onChange={(event) => setForm({ ...form, care_instructions: event.target.value })} className="premium-input min-h-28" placeholder="Instrucciones" />
          <textarea value={form.warning_signs} onChange={(event) => setForm({ ...form, warning_signs: event.target.value })} className="premium-input min-h-24" placeholder="Signos de alarma" />
          <textarea value={form.next_steps} onChange={(event) => setForm({ ...form, next_steps: event.target.value })} className="premium-input min-h-24" placeholder="Proximos pasos" />
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.is_visible_to_patient} onChange={(event) => setForm({ ...form, is_visible_to_patient: event.target.checked })} />
            <span className="text-sm font-semibold">Visible para paciente</span>
          </label>
        </div>
        <button onClick={() => void submit()} className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          Guardar cuidados
        </button>
      </section>

      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{item.care_instructions}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
