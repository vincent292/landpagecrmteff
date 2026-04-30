import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { createPrescription, getPrescriptionsByPatient } from "../../services/prescriptionService";
import {
  createPrescriptionTemplate,
  getPrescriptionTemplates,
  type PrescriptionTemplateRow,
} from "../../services/templateService";

export function PatientPrescriptionsAdminPage() {
  const { id = "" } = useParams();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getPrescriptionsByPatient>>>([]);
  const [templates, setTemplates] = useState<PrescriptionTemplateRow[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [form, setForm] = useState({ title: "", prescription_text: "", indications: "", is_visible_to_patient: true });

  const load = () => void getPrescriptionsByPatient(id).then(setItems);
  useEffect(load, [id]);
  useEffect(() => {
    void getPrescriptionTemplates().then(setTemplates);
  }, []);

  const submit = async () => {
    await createPrescription({ ...form, patient_id: id });
    setForm({ title: "", prescription_text: "", indications: "", is_visible_to_patient: true });
    load();
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setForm({
      title: template.title,
      prescription_text: template.prescription_text,
      indications: template.indications ?? "",
      is_visible_to_patient: form.is_visible_to_patient,
    });
  };

  const saveAsTemplate = async () => {
    if (!form.title.trim() || !form.prescription_text.trim()) return;
    setSavingTemplate(true);
    await createPrescriptionTemplate({
      title: form.title,
      prescription_text: form.prescription_text,
      indications: form.indications || null,
      is_active: true,
    });
    const nextTemplates = await getPrescriptionTemplates();
    setTemplates(nextTemplates);
    setSavingTemplate(false);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Recetas del paciente</h1>
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
          <textarea value={form.prescription_text} onChange={(event) => setForm({ ...form, prescription_text: event.target.value })} className="premium-input min-h-28" placeholder="Texto de receta" />
          <textarea value={form.indications} onChange={(event) => setForm({ ...form, indications: event.target.value })} className="premium-input min-h-24" placeholder="Indicaciones" />
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.is_visible_to_patient} onChange={(event) => setForm({ ...form, is_visible_to_patient: event.target.checked })} />
            <span className="text-sm font-semibold">Visible para paciente</span>
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => void submit()} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            Guardar receta
          </button>
          <button
            onClick={() => void saveAsTemplate()}
            disabled={savingTemplate || !form.title.trim() || !form.prescription_text.trim()}
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
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--color-copy)]">{item.prescription_text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
