import { Link, Outlet } from "react-router-dom";

import { Footer } from "../components/layout/Footer";
import { WhatsAppButton } from "../components/platform/WhatsAppButton";

const links = [
  ["Tratamientos", "/tratamientos"],
  ["Promociones", "/promociones"],
  ["Cursos", "/cursos"],
  ["Agenda", "/agenda"],
  ["Galería", "/galeria"],
  ["Doctora", "/sobre-la-doctora"],
  ["Contacto", "/contacto"],
];

export function PublicLayout() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-base)_0%,#fff9f4_48%,var(--color-surface-soft)_100%)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(255,249,244,0.78)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link to="/" className="font-display text-2xl font-semibold">
            Dra. Estefany
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-[var(--color-copy)] lg:flex">
            {links.map(([label, href]) => (
              <Link key={href} to={href} className="transition hover:text-[var(--color-ink)]">
                {label}
              </Link>
            ))}
          </nav>
          <Link
            to="/login"
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
          >
            Acceso
          </Link>
        </div>
      </header>
      <Outlet />
      <Footer />
      <WhatsAppButton />
    </main>
  );
}
