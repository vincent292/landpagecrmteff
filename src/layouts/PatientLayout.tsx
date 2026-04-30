import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
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
  const [open, setOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)] text-[var(--color-ink)] lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.92)] p-4 backdrop-blur-2xl lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/75"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Portal privado</p>
          <p className="truncate text-xs text-[var(--color-copy)]">{profile?.full_name ?? user?.email ?? "Paciente"}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/75"
          aria-label="Cerrar sesion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {open && <button type="button" aria-label="Cerrar menu" className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(82vw,280px)] -translate-x-full border-r border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.96)] p-5 shadow-[20px_0_60px_rgba(43,33,27,0.18)] backdrop-blur-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:w-auto lg:translate-x-0 lg:overflow-y-auto lg:shadow-none",
          open && "translate-x-0"
        )}
      >
        <div className="flex items-start justify-between gap-4 lg:block">
          <div className="min-w-0">
            <BrandSignature
              subtitle="Portal privado"
              textClassName="text-[1.35rem] sm:text-[1.55rem] lg:text-[1.8rem]"
              subtitleClassName="tracking-[0.18em]"
              className="max-w-full"
            />
            <p className="mt-2 hidden text-sm text-[var(--color-copy)] sm:block lg:mt-3">
              Un espacio sereno para seguir tus citas, cuidados y descargas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/70 text-[var(--color-ink)] lg:hidden"
            aria-label="Cerrar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-8 grid gap-2">
          {patientLinks.map(([label, href]) => (
            <NavLink
              key={href}
              to={href}
              end={href === "/mi-panel"}
              onClick={() => setOpen(false)}
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
          className="mt-8 hidden w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold lg:inline-flex"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </button>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-[76px] z-30 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.82)] px-4 py-4 backdrop-blur-xl md:px-8 lg:top-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {profile?.full_name ?? user?.email ?? "Paciente"}
            </p>
            <p className="text-xs text-[var(--color-copy)]">
              Tu informacion y documentos privados viven aqui.
            </p>
          </div>
        </header>

        <section className="min-w-0 overflow-x-hidden p-4 sm:p-5 md:p-8">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
