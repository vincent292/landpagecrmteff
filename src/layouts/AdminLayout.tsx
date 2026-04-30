import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { BrandSignature } from "../components/common/BrandSignature";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/cn";
import { canAccessAdminModule, canManageUsers, roleLabels } from "../lib/roles";

const adminLinks = [
  ["Dashboard", "/panel", "dashboard"],
  ["Pacientes", "/panel/pacientes", "pacientes"],
  ["Doctoras", "/panel/doctoras", "doctoras"],
  ["Tratamientos", "/panel/tratamientos", "tratamientos"],
  ["Promociones", "/panel/promociones", "promociones"],
  ["Cursos", "/panel/cursos", "cursos"],
  ["Inscripciones", "/panel/inscripciones", "inscripciones"],
  ["Solicitudes", "/panel/solicitudes", "solicitudes"],
  ["Agenda", "/panel/agenda", "agenda"],
  ["Calendario citas", "/panel/calendario-citas", "calendario-citas"],
  ["Disponibilidad", "/panel/disponibilidad", "disponibilidad"],
  ["Citas", "/panel/citas", "citas"],
  ["Libros", "/panel/libros", "libros"],
  ["Pedidos libros", "/panel/pedidos-libros", "pedidos-libros"],
  ["Tokens libros", "/panel/tokens-libros", "tokens-libros"],
  ["Galeria", "/panel/galeria", "galeria"],
  ["Usuarios", "/panel/usuarios", "usuarios"],
  ["Configuracion", "/panel/configuracion", "configuracion"],
];

export function AdminLayout() {
  const { signOut, role, user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const visibleLinks = adminLinks.filter(([label, , module]) => {
    if (label === "Usuarios" && !canManageUsers(role)) return false;
    return canAccessAdminModule(role, module);
  });
  const activeModule = location.pathname.replace(/^\/panel\/?/, "").split("/")[0] || "dashboard";

  if (!canAccessAdminModule(role, activeModule)) {
    if (activeModule === "dashboard") {
      return (
        <main className="min-h-screen bg-[#f7f2ec] p-6 text-[var(--color-ink)]">
          <section className="mx-auto mt-20 max-w-xl rounded-[28px] border border-[var(--color-border)] bg-white/75 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Acceso restringido
            </p>
            <h1 className="font-display mt-3 text-4xl font-semibold">Tu rol no tiene modulos administrativos asignados.</h1>
            <button onClick={() => void signOut()} className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
              Cerrar sesion
            </button>
          </section>
        </main>
      );
    }
    return <Navigate to="/panel" replace />;
  }

  return (
    <main className="min-h-screen bg-[#f7f2ec] text-[var(--color-ink)] lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
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
          <p className="truncate text-sm font-semibold">Panel administrativo</p>
          <p className="truncate text-xs text-[var(--color-copy)]">{roleLabels[role]}</p>
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
          "fixed inset-y-0 left-0 z-50 w-[min(82vw,300px)] -translate-x-full border-r border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.96)] p-5 shadow-[20px_0_60px_rgba(43,33,27,0.18)] backdrop-blur-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:w-auto lg:translate-x-0 lg:overflow-y-auto lg:shadow-none",
          open && "translate-x-0"
        )}
      >
        <div className="flex items-start justify-between gap-4 lg:block">
          <div className="min-w-0">
            <BrandSignature
              subtitle="Panel administrativo"
              textClassName="text-[1.35rem] sm:text-[1.55rem] lg:text-[1.8rem]"
              subtitleClassName="tracking-[0.18em]"
              className="max-w-full"
            />
            <p className="mt-2 truncate text-xs text-[var(--color-copy)] sm:text-sm">
              Panel administrativo · {roleLabels[role]}
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
          {visibleLinks.map(([label, href]) => (
            <NavLink
              key={href}
              to={href}
              end={href === "/panel"}
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
        <header className="sticky top-[76px] z-30 flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.82)] px-4 py-4 backdrop-blur-xl md:px-8 lg:top-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {user?.user_metadata.full_name ?? user?.email ?? "Usuario"}
            </p>
            <p className="text-xs text-[var(--color-copy)]">Rol: {roleLabels[role]}</p>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-2 text-sm font-semibold sm:inline-flex"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </header>

        <section className="min-w-0 overflow-x-hidden p-4 sm:p-5 md:p-8">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
