import { NavLink, Outlet } from "react-router-dom";

import { BrandSignature } from "../components/common/BrandSignature";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/cn";

const patientLinks = [
  ["Inicio", "/mi-panel"],
  ["Perfil", "/mi-panel/perfil"],
  ["Citas", "/mi-panel/citas"],
  ["Reservar cita", "/mi-panel/reservar-cita"],
  ["Cuidados", "/mi-panel/cuidados"],
  ["Recetas", "/mi-panel/recetas"],
  ["Tratamientos", "/mi-panel/tratamientos"],
  ["Libros", "/mi-panel/libros"],
  ["Descargas", "/mi-panel/descargas"],
];

export function PatientLayout() {
  const { signOut, profile, user } = useAuth();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)] text-[var(--color-ink)] lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-r border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.8)] p-5 backdrop-blur-2xl">
        <BrandSignature
          subtitle="Portal privado"
          textClassName="text-[1.6rem] sm:text-[1.8rem]"
          subtitleClassName="tracking-[0.18em]"
          className="max-w-full"
        />
        <p className="mt-2 text-sm text-[var(--color-copy)]">
          Un espacio sereno para seguir tus citas, cuidados y descargas.
        </p>

        <nav className="mt-8 grid gap-2">
          {patientLinks.map(([label, href]) => (
            <NavLink
              key={href}
              to={href}
              end={href === "/mi-panel"}
              className={({ isActive }) =>
                cn(
                  "rounded-2xl px-4 py-3 text-sm font-medium transition",
                  isActive
                    ? "bg-[var(--color-mocha)] text-white"
                    : "text-[var(--color-copy)] hover:bg-white/60 hover:text-[var(--color-ink)]"
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-8 w-full rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold"
        >
          Cerrar sesión
        </button>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.82)] px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {profile?.full_name ?? user?.email ?? "Paciente"}
            </p>
            <p className="text-xs text-[var(--color-copy)]">
              Tu información y documentos privados viven aquí.
            </p>
          </div>
        </header>

        <section className="p-5 md:p-8">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
