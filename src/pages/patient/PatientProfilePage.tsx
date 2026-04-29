import { useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { updateMyProfile } from "../../services/profileService";

export function PatientProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [saved, setSaved] = useState("");

  const save = async () => {
    if (!profile) return;
    await updateMyProfile(profile.id, { full_name: fullName, phone, city });
    await refreshProfile();
    setSaved("Tus datos se actualizaron correctamente.");
  };

  return (
    <div className="max-w-3xl rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Perfil</p>
      <h1 className="font-display mt-3 text-5xl font-semibold">Tus datos principales</h1>
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
          <input value={city} onChange={(event) => setCity(event.target.value)} className="premium-input mt-2" />
        </label>
      </div>
      {saved ? <p className="mt-4 text-sm text-[var(--color-mocha)]">{saved}</p> : null}
      <button onClick={() => void save()} className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
        Guardar cambios
      </button>
    </div>
  );
}
