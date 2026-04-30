import { useEffect, useState } from "react";

import { Menu, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { BrandSignature } from "../common/BrandSignature";
import { cn } from "../../lib/cn";

const publicLinks = [
  { label: "Tratamientos", href: "/tratamientos" },
  { label: "Promociones", href: "/promociones" },
  { label: "Cursos", href: "/cursos" },
  { label: "Libros", href: "/libros" },
  { label: "Agenda", href: "/agenda" },
  { label: "Galería", href: "/galeria" },
  { label: "Doctoras", href: "/doctoras" },
];

export function PremiumNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);

    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [menuOpen]);

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4 md:px-6">
      <div className="relative mx-auto max-w-7xl">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[28px] transition-all duration-500 sm:rounded-full",
            scrolled
              ? "bg-[radial-gradient(circle_at_top,rgba(255,249,244,0.58),transparent_62%)] blur-xl"
              : "bg-[radial-gradient(circle_at_top,rgba(255,249,244,0.38),transparent_62%)] blur-2xl"
          )}
        />

        <div
          className={cn(
            "relative rounded-[28px] border transition-all duration-500 sm:rounded-[30px] lg:rounded-full",
            scrolled
              ? "border-[rgba(184,138,90,0.20)] bg-[rgba(255,249,244,0.82)] shadow-[0_18px_45px_rgba(110,74,47,0.10)] backdrop-blur-[22px] backdrop-saturate-150"
              : "border-[rgba(184,138,90,0.16)] bg-[rgba(255,249,244,0.62)] shadow-[0_10px_30px_rgba(110,74,47,0.06)] backdrop-blur-[18px] backdrop-saturate-140"
          )}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 md:px-7">
            <BrandSignature
              className="min-w-0 pr-2"
              subtitle="Medicina estetica"
              textClassName="text-[1.55rem] sm:text-[1.8rem] lg:text-[1.95rem]"
              subtitleClassName="hidden sm:block"
            />

            <nav className="hidden items-center gap-7 lg:flex">
              {publicLinks.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      "text-sm text-[var(--color-copy)] transition-colors duration-300 hover:text-[var(--color-ink)]",
                      isActive && "text-[var(--color-ink)]"
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="hidden shrink-0 rounded-full border border-[rgba(184,138,90,0.22)] bg-[rgba(255,249,244,0.72)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition duration-300 hover:-translate-y-0.5 hover:bg-white/90 lg:inline-flex"
              >
                Acceso
              </Link>

              <button
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.72)] text-[var(--color-ink)] lg:hidden"
                aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="border-t border-[rgba(184,138,90,0.12)] px-5 pb-5 pt-4 lg:hidden">
              <nav className="grid gap-2">
                {publicLinks.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-2xl px-4 py-3 text-sm text-[var(--color-copy)] transition hover:bg-white/70 hover:text-[var(--color-ink)]",
                        isActive && "bg-white/80 text-[var(--color-ink)]"
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 inline-flex justify-center rounded-full border border-[rgba(184,138,90,0.22)] bg-[rgba(255,249,244,0.86)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
                >
                  Acceso
                </Link>
              </nav>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
