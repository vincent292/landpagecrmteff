import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { createPostTreatmentCare, getPostCaresByPatient } from "../../services/postCareService";
import { createPostCareTemplate, getPostCareTemplates, type PostCareTemplateRow } from "../../services/templateService";

export function PatientCaresAdminPage() {
  const { id = "" } = useParams();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getPostCaresByPatient>>>([]);
  const [templates, setTemplates] = useState<PostCareTemplateRow[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
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
  useEffect(() => {
    void getPostCareTemplates().then(setTemplates);
  }, []);

  const submit = async () => {
    await createPostTreatmentCare({ ...form, patient_id: id });
    setForm({ title: "", treatment_name: "", care_instructions: "", warning_signs: "", next_steps: "", is_visible_to_patient: true });
    load();
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setForm({
      title: template.title,
      treatment_name: template.treatment_name ?? "",
      care_instructions: template.care_instructions,
      warning_signs: template.warning_signs ?? "",
      next_steps: template.next_steps ?? "",
      is_visible_to_patient: form.is_visible_to_patient,
    });
  };

  const saveAsTemplate = async () => {
    if (!form.title.trim() || !form.care_instructions.trim()) return;
    setSavingTemplate(true);
    await createPostCareTemplate({
      title: form.title,
      treatment_name: form.treatment_name || null,
      care_instructions: form.care_instructions,
      warning_signs: form.warning_signs || null,
      next_steps: form.next_steps || null,
      is_active: true,
    });
    const nextTemplates = await getPostCareTemplates();
    setTemplates(nextTemplates);
    setSavingTemplate(false);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Cuidados postratamiento</h1>
        <div className="mt-6 grid gap-4">
          <select defaultValue="" onChange={(event) => applyTemplate(event.target.value)} className="premium-input">
            <option value="">Usar plantilla guardada</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
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
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => void submit()} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            Guardar cuidados
          </button>
          <button
            onClick={() => void saveAsTemplate()}
            disabled={savingTemplate || !form.title.trim() || !form.care_instructions.trim()}
            className="rounded-full border border-[var(--color-border)] bg-white/70 px-6 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {savingTemplate ? "Guardando..." : "Guardar como plantilla"}
          </button>
        </div>
      </section>

      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--color-copy)]">
              Registrado por {item.profiles?.full_name ?? item.profiles?.email ?? "equipo medico"}
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{item.care_instructions}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
