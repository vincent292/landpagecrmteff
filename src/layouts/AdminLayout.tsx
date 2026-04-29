import { NavLink, Outlet } from "react-router-dom";

import { BrandSignature } from "../components/common/BrandSignature";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/cn";
import { canManageUsers, roleLabels } from "../lib/roles";

const adminLinks = [
  ["Dashboard", "/panel"],
  ["Pacientes", "/panel/pacientes"],
  ["Tratamientos", "/panel/tratamientos"],
  ["Promociones", "/panel/promociones"],
  ["Cursos", "/panel/cursos"],
  ["Inscripciones", "/panel/inscripciones"],
  ["Solicitudes", "/panel/solicitudes"],
  ["Agenda", "/panel/agenda"],
  ["Disponibilidad", "/panel/disponibilidad"],
  ["Citas", "/panel/citas"],
  ["Libros", "/panel/libros"],
  ["Pedidos libros", "/panel/pedidos-libros"],
  ["Tokens libros", "/panel/tokens-libros"],
  ["Galeria", "/panel/galeria"],
  ["Usuarios", "/panel/usuarios"],
];

export function AdminLayout() {
  const { signOut, role, user } = useAuth();
  const visibleLinks = adminLinks.filter(([label]) => label !== "Usuarios" || canManageUsers(role));

  return (
    <main className="min-h-screen bg-[#f7f2ec] text-[var(--color-ink)] lg:grid lg:grid-cols-[300px_1fr]">
      <aside className="border-r border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.78)] p-5 backdrop-blur-2xl">
        <BrandSignature
          subtitle="Panel administrativo"
          textClassName="text-[1.65rem] sm:text-[1.8rem]"
          subtitleClassName="tracking-[0.18em]"
          className="max-w-full"
        />
        <p className="mt-2 text-sm text-[var(--color-copy)]">
          Panel administrativo · {roleLabels[role]}
        </p>

        <nav className="mt-8 grid gap-2">
          {visibleLinks.map(([label, href]) => (
            <NavLink
              key={href}
              to={href}
              end={href === "/panel"}
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
          Cerrar sesion
        </button>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.82)] px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {user?.user_metadata.full_name ?? user?.email ?? "Usuario"}
            </p>
            <p className="text-xs text-[var(--color-copy)]">Rol: {roleLabels[role]}</p>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-2 text-sm font-semibold"
          >
            Logout
          </button>
        </header>

        <section className="p-5 md:p-8">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
