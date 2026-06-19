import { Bell, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { BrandSignature } from "../components/common/BrandSignature";
import { useAuth } from "../hooks/useAuth";
import { useAdminNotifications } from "../hooks/useAdminNotifications";
import { cn } from "../lib/cn";
import { canAccessAdminModule, canManageUsers, isDoctorRole, roleLabels } from "../lib/roles";

type AdminLink = {
  label: string;
  href: string;
  module: string;
};

type AdminSection = {
  title: string;
  accent: string;
  icon: LucideIcon;
  links: AdminLink[];
};

const adminSections: AdminSection[] = [
  {
    title: "General",
    accent: "from-[rgba(255,255,255,0.84)] to-[rgba(239,229,218,0.86)]",
    icon: Bell,
    links: [
      { label: "Dashboard", href: "/panel", module: "dashboard" },
      { label: "Mi perfil medico", href: "/panel/mi-perfil", module: "mi-perfil" },
      { label: "Solicitudes", href: "/panel/solicitudes", module: "solicitudes" },
      { label: "Citas", href: "/panel/citas", module: "citas" },
      { label: "Calendario citas", href: "/panel/calendario-citas", module: "calendario-citas" },
      { label: "Agenda", href: "/panel/agenda", module: "agenda" },
      { label: "Disponibilidad", href: "/panel/disponibilidad", module: "disponibilidad" },
      { label: "Pacientes", href: "/panel/pacientes", module: "pacientes" },
    ],
  },
  {
    title: "Operacion",
    accent: "from-[rgba(255,249,244,0.88)] to-[rgba(216,194,174,0.3)]",
    icon: Menu,
    links: [
      { label: "Inventario", href: "/panel/inventario", module: "inventario" },
      { label: "Caja", href: "/panel/caja", module: "caja" },
      { label: "Pagos y Reservas", href: "/panel/pagos-reservas", module: "pagos-reservas" },
      { label: "Planes de pago", href: "/panel/planes-pago", module: "planes-pago" },
      { label: "Tarjetas ahorro", href: "/panel/tarjetas-ahorro", module: "tarjetas-ahorro" },
      { label: "Libros", href: "/panel/libros", module: "libros" },
    ],
  },
  {
    title: "Contenido",
    accent: "from-[rgba(255,255,255,0.82)] to-[rgba(198,162,123,0.22)]",
    icon: X,
    links: [
      { label: "Doctoras", href: "/panel/doctoras", module: "doctoras" },
      { label: "Tratamientos", href: "/panel/tratamientos", module: "tratamientos" },
      { label: "Promociones", href: "/panel/promociones", module: "promociones" },
      { label: "Academy", href: "/panel/academy", module: "cursos" },
      { label: "Galeria", href: "/panel/galeria", module: "galeria" },
    ],
  },
  {
    title: "Sistema",
    accent: "from-[rgba(255,249,244,0.88)] to-[rgba(183,156,132,0.22)]",
    icon: LogOut,
    links: [
      { label: "Usuarios", href: "/panel/usuarios", module: "usuarios" },
      { label: "Configuracion", href: "/panel/configuracion", module: "configuracion" },
    ],
  },
];

export function AdminLayout() {
  const { signOut, role, user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const mobileNotificationsRef = useRef<HTMLDivElement | null>(null);
  const desktopNotificationsRef = useRef<HTMLDivElement | null>(null);
  const normalizeAdminModule = (value: string) => (value === "academy" ? "cursos" : value);
  const activeModule = normalizeAdminModule(location.pathname.replace(/^\/panel\/?/, "").split("/")[0] || "dashboard");
  const { items: notifications, unreadCount, unreadByModule, markAllAsSeen } = useAdminNotifications(user?.id ?? null, role);
  const persistentBadgeByModule = useMemo(() => {
    const badges = { ...unreadByModule };
    const hasInventoryAlert = notifications.some((item) => item.type === "inventory");
    if (hasInventoryAlert) {
      badges.dashboard = Math.max(badges.dashboard ?? 0, 1);
    }
    return badges;
  }, [notifications, unreadByModule]);

  const visibleSections = adminSections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => {
        if (link.module === "mi-perfil" && !isDoctorRole(role)) return false;
        if (link.label === "Usuarios" && !canManageUsers(role)) return false;
        return canAccessAdminModule(role, link.module);
      }),
    }))
    .filter((section) => section.links.length > 0);

  const activeLink = visibleSections.flatMap((section) => section.links).find((link) => link.module === activeModule);

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
    <main className="min-h-screen overflow-x-hidden bg-[#f7f2ec] text-[var(--color-ink)] lg:pl-[300px]">
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

      {open ? (
        <button
          type="button"
          aria-label="Cerrar menu"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(84vw,300px)] -translate-x-full flex-col overflow-hidden overscroll-contain border-r border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.96)] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[20px_0_60px_rgba(43,33,27,0.18)] backdrop-blur-2xl transition-transform duration-300 [webkit-overflow-scrolling:touch] touch-pan-y lg:z-40 lg:h-screen lg:w-[300px] lg:translate-x-0 lg:border-r-[rgba(198,162,123,0.22)] lg:bg-[rgba(255,249,244,0.88)] lg:pb-5 lg:shadow-none",
          open && "translate-x-0"
        )}
      >
        <div className="rounded-[28px] border border-[rgba(198,162,123,0.16)] bg-white/58 p-4 shadow-[0_18px_46px_rgba(62,42,31,0.06)]">
          <div className="flex items-start justify-between gap-4">
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
        </div>

        <nav className="mt-6 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-6 pb-6">
            {visibleSections.map((section) => {
              const SectionIcon = section.icon;

              return (
                <div
                  key={section.title}
                  className={cn(
                    "rounded-[26px] border border-[rgba(198,162,123,0.14)] bg-[linear-gradient(135deg,rgba(255,249,244,0.74),rgba(255,255,255,0.52))] p-3",
                    `bg-gradient-to-br ${section.accent}`
                  )}
                >
                  <div className="flex items-center gap-2 px-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(198,162,123,0.16)] bg-white/72 text-[var(--color-mocha)]">
                      <SectionIcon className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                      {section.title}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {section.links.map((link) => (
                      <NavLink
                        key={link.href}
                        to={link.href}
                        end={link.href === "/panel"}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                            isActive
                              ? "border-[rgba(110,74,47,0.26)] bg-[var(--color-mocha)] text-white shadow-[0_14px_32px_rgba(110,74,47,0.18)]"
                              : "border-transparent bg-white/20 text-[var(--color-copy)] hover:border-[rgba(198,162,123,0.18)] hover:bg-white/70 hover:text-[var(--color-ink)]"
                          )
                        }
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{link.label}</span>
                          {persistentBadgeByModule[link.module] ? (
                            <span
                              className={cn(
                                "inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white",
                                link.module === "dashboard"
                                  ? "animate-pulse bg-red-600 shadow-[0_8px_20px_rgba(166,38,38,0.25)]"
                                  : "animate-pulse bg-[var(--color-mocha)]"
                              )}
                            >
                              {persistentBadgeByModule[link.module] > 9 ? "9+" : persistentBadgeByModule[link.module]}
                            </span>
                          ) : null}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 hidden w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/62 px-4 py-3 text-sm font-semibold lg:inline-flex"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </button>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-[76px] z-30 flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.82)] px-4 py-4 backdrop-blur-xl md:px-8 lg:top-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              {activeLink?.label ?? "Dashboard"}
            </p>
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {user?.user_metadata.full_name ?? user?.email ?? "Usuario"}
            </p>
            <p className="text-xs text-[var(--color-copy)]">Rol: {roleLabels[role]}</p>
          </div>

          <div className="flex items-center gap-3">
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
            />
            <button
              type="button"
              onClick={() => void signOut()}
              className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-2 text-sm font-semibold sm:inline-flex"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
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
}: {
  items: { id: string; title: string; detail: string; href: string; createdAt: string }[];
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  desktopOnly?: boolean;
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
              <p className="text-xs text-[var(--color-copy)]">Solicitudes, pagos, citas e inventario en un solo lugar.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold">
              Cerrar
            </button>
          </div>
          <div className="mt-3 grid max-h-[60vh] gap-2 overflow-y-auto">
            {items.length === 0 ? (
              <p className="rounded-[18px] bg-white/70 px-4 py-5 text-sm text-[var(--color-copy)]">Todavia no hay novedades en tiempo real.</p>
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
