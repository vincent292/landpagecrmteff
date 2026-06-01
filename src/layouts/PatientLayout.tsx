import { Bell, LogOut, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { BrandSignature } from "../components/common/BrandSignature";
import { useAuth } from "../hooks/useAuth";
import { usePatientNotifications } from "../hooks/usePatientNotifications";
import { cn } from "../lib/cn";

type PatientLink = {
  label: string;
  href: string;
  module: string;
};

const patientLinks: PatientLink[] = [
  { label: "Inicio", href: "/mi-panel", module: "dashboard" },
  { label: "Perfil", href: "/mi-panel/perfil", module: "perfil" },
  { label: "Citas", href: "/mi-panel/citas", module: "citas" },
  { label: "Cursos", href: "/mi-panel/cursos", module: "cursos" },
  { label: "Promociones", href: "/mi-panel/promociones", module: "promociones" },
  { label: "Tarjetas ahorro", href: "/mi-panel/tarjetas-ahorro", module: "tarjetas-ahorro" },
  { label: "Reservar cita", href: "/mi-panel/reservar-cita", module: "reservar-cita" },
  { label: "Cuidados", href: "/mi-panel/cuidados", module: "cuidados" },
  { label: "Recetas", href: "/mi-panel/recetas", module: "recetas" },
  { label: "Tratamientos", href: "/mi-panel/tratamientos", module: "tratamientos" },
  { label: "Libros", href: "/mi-panel/libros", module: "libros" },
  { label: "Descargas", href: "/mi-panel/descargas", module: "descargas" },
];

export function PatientLayout() {
  const { signOut, profile, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const mobileNotificationsRef = useRef<HTMLDivElement | null>(null);
  const desktopNotificationsRef = useRef<HTMLDivElement | null>(null);
  const { items: notifications, unreadCount, unreadByModule, markAllAsSeen } = usePatientNotifications(user?.id ?? null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedMobileBell = mobileNotificationsRef.current?.contains(target);
      const clickedDesktopBell = desktopNotificationsRef.current?.contains(target);

      if (!clickedMobileBell && !clickedDesktopBell) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notificationsOpen]);

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
        <div className="flex items-center gap-2">
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            open={notificationsOpen}
            onToggle={() => {
              const next = !notificationsOpen;
              setNotificationsOpen(next);
              if (next) markAllAsSeen();
            }}
            onClose={() => setNotificationsOpen(false)}
            containerRef={mobileNotificationsRef}
            subtitle="Citas, pagos, recetas, cuidados y descargas privadas."
            emptyLabel="Todavia no tienes novedades nuevas."
          />
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/75"
            aria-label="Cerrar sesion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open ? <button type="button" aria-label="Cerrar menu" className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} /> : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(84vw,280px)] -translate-x-full flex-col overflow-y-auto overscroll-contain border-r border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.96)] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[20px_0_60px_rgba(43,33,27,0.18)] backdrop-blur-2xl transition-transform duration-300 [webkit-overflow-scrolling:touch] touch-pan-y lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:w-auto lg:translate-x-0 lg:pb-5 lg:shadow-none",
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
              Un espacio sereno para seguir tus citas, cuidados, recetas y descargas.
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
          {patientLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.href === "/mi-panel"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  isActive
                    ? "bg-[var(--color-mocha)] text-white"
                    : "text-[var(--color-copy)] hover:bg-white/60 hover:text-[var(--color-ink)]"
                )
              }
            >
              <span>{link.label}</span>
              {(unreadByModule[link.module] ?? 0) > 0 ? (
                <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[rgba(255,255,255,0.22)] px-1 text-[10px] font-bold">
                  {(unreadByModule[link.module] ?? 0) > 9 ? "9+" : unreadByModule[link.module]}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-auto hidden w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-3 pt-8 text-sm font-semibold lg:inline-flex"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </button>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-[76px] z-30 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.82)] px-4 py-4 backdrop-blur-xl md:px-8 lg:top-0">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                {profile?.full_name ?? user?.email ?? "Paciente"}
              </p>
              <p className="text-xs text-[var(--color-copy)]">
                Tu informacion, tus pagos y tus documentos privados viven aqui.
              </p>
            </div>

            <NotificationBell
              items={notifications}
              unreadCount={unreadCount}
              open={notificationsOpen}
              onToggle={() => {
                const next = !notificationsOpen;
                setNotificationsOpen(next);
                if (next) markAllAsSeen();
              }}
              onClose={() => setNotificationsOpen(false)}
              containerRef={desktopNotificationsRef}
              desktopOnly
              subtitle="Citas, pagos, recetas, cuidados y descargas privadas."
              emptyLabel="Todavia no tienes novedades nuevas."
            />
          </div>
        </header>

        <section className="min-w-0 overflow-x-hidden p-4 sm:p-5 md:p-8">
          <Outlet />
        </section>
      </div>
    </main>
  );
}

function NotificationBell({
  items,
  unreadCount,
  open,
  onToggle,
  onClose,
  containerRef,
  desktopOnly = false,
  subtitle,
  emptyLabel,
}: {
  items: { id: string; title: string; detail: string; href: string; createdAt: string }[];
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  desktopOnly?: boolean;
  subtitle: string;
  emptyLabel: string;
}) {
  return (
    <div ref={containerRef} className={cn("relative", desktopOnly ? "hidden lg:block" : "")}>
      <button
        type="button"
        onClick={onToggle}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/75"
        aria-label="Abrir notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-mocha)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-[120] w-[min(92vw,360px)] rounded-[24px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.98)] p-3 shadow-[0_24px_60px_rgba(43,33,27,0.18)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <div>
              <p className="text-sm font-semibold text-[var(--color-ink)]">Notificaciones</p>
              <p className="text-xs text-[var(--color-copy)]">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold">
              Cerrar
            </button>
          </div>
          <div className="mt-3 grid max-h-[60vh] gap-2 overflow-y-auto">
            {items.length === 0 ? (
              <p className="rounded-[18px] bg-white/70 px-4 py-5 text-sm text-[var(--color-copy)]">{emptyLabel}</p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={onClose}
                  className="rounded-[18px] border border-[rgba(198,162,123,0.14)] bg-white/74 px-4 py-3 transition hover:bg-white"
                >
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-copy)]">{item.detail}</p>
                  <p className="mt-2 text-xs text-[var(--color-copy)]">{new Date(item.createdAt).toLocaleString("es-BO")}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
