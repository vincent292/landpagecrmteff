import { useEffect, useState } from "react";

import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { getPatientByProfileId, upsertMyPatientProfile } from "../../services/patientService";
import { normalizeDocumentNumber } from "../../utils/documentNumber";

export function PatientProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [documentNumber, setDocumentNumber] = useState(profile?.document_number ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setCity(profile?.city ?? "");
    setDocumentNumber(profile?.document_number ?? "");
  }, [profile?.city, profile?.document_number, profile?.full_name, profile?.phone]);

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getPatientByProfileId(profile.id)
      .then((patient) => {
        setBirthDate(patient?.birth_date ?? "");
        setGender(patient?.gender ?? "");
        setEmergencyContact(patient?.emergency_contact ?? "");
        setEmergencyRelationship(patient?.emergency_contact_relationship ?? "");
        setAddress(patient?.address ?? "");
        setNotes(patient?.notes ?? "");
      })
      .catch(() => {
        setBirthDate("");
        setGender("");
        setEmergencyContact("");
        setEmergencyRelationship("");
        setAddress("");
        setNotes("");
      })
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const save = async () => {
    if (!profile) return;
    const normalizedDocumentNumber = normalizeDocumentNumber(documentNumber);
    if (!normalizedDocumentNumber) {
      setSaved("Necesitamos tu numero de carnet para unificar tu historial en el portal.");
      return;
    }
    setSaving(true);
    setSaved("");
    try {
      await upsertMyPatientProfile({
        full_name: fullName,
        phone,
        email: profile.email ?? null,
        city,
        document_number: normalizedDocumentNumber,
        birth_date: birthDate || null,
        gender: gender || null,
        emergency_contact: emergencyContact || null,
        emergency_contact_relationship: emergencyRelationship || null,
        address: address || null,
        notes: notes || null,
      });
      await refreshProfile();
      setDocumentNumber(normalizedDocumentNumber);
      setSaved("Tus datos del portal se actualizaron correctamente.");
    } catch (error) {
      setSaved(error instanceof Error ? error.message : "No pudimos actualizar tus datos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Perfil</p>
      <h1 className="font-display mt-3 text-5xl font-semibold">Tus datos principales</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
        Completa tu ficha para que recetas, citas, cuidados y seguimiento queden bien vinculados a tu cuenta.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <label>
          <span className="text-sm font-semibold">Nombre completo</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="premium-input mt-2" />
        </label>
        <label>
          <span className="text-sm font-semibold">Correo</span>
          <input value={profile?.email ?? ""} disabled className="premium-input mt-2 opacity-70" />
        </label>
        <label>
          <span className="text-sm font-semibold">Celular</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className="premium-input mt-2" />
        </label>
        <label>
          <span className="text-sm font-semibold">Ciudad</span>
          <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input mt-2">
            <option value="">Selecciona ciudad</option>
            {boliviaCities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Numero de carnet / CI</span>
          <input value={documentNumber} onChange={(event) => setDocumentNumber(normalizeDocumentNumber(event.target.value))} className="premium-input mt-2" />
        </label>
        <label>
          <span className="text-sm font-semibold">Fecha de nacimiento</span>
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="premium-input mt-2" />
        </label>
        <label>
          <span className="text-sm font-semibold">Sexo</span>
          <select value={gender} onChange={(event) => setGender(event.target.value)} className="premium-input mt-2">
            <option value="">Selecciona una opcion</option>
            <option value="Femenino">Femenino</option>
            <option value="Masculino">Masculino</option>
            <option value="Prefiero no indicarlo">Prefiero no indicarlo</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Contacto de emergencia</span>
          <input
            value={emergencyContact}
            onChange={(event) => setEmergencyContact(event.target.value)}
            className="premium-input mt-2"
            placeholder="Nombre y celular"
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Parentesco</span>
          <input
            value={emergencyRelationship}
            onChange={(event) => setEmergencyRelationship(event.target.value)}
            className="premium-input mt-2"
            placeholder="Madre, esposo, hermana..."
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-sm font-semibold">Direccion o referencia</span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="premium-input mt-2"
            placeholder="Zona, calle o referencia util"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-sm font-semibold">Observaciones personales</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="premium-input mt-2 min-h-28"
            placeholder="Alergias, comentarios o informacion que quieras dejar registrada."
          />
        </label>
      </div>
      {loading ? <p className="mt-4 text-sm text-[var(--color-copy)]">Cargando tu ficha clinica...</p> : null}
      {saved ? <p className="mt-4 text-sm text-[var(--color-mocha)]">{saved}</p> : null}
      <button
        onClick={() => void save()}
        disabled={saving}
        className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}
