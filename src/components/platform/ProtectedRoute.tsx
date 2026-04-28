import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";

type ProtectedRouteProps = {
  requireStaff?: boolean;
};

export function ProtectedRoute({ requireStaff = false }: ProtectedRouteProps) {
  const { user, loading, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-base)] text-[var(--color-copy)]">
        Cargando acceso...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireStaff && !["admin", "assistant"].includes(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-base)] px-6 text-center">
        <div className="max-w-md rounded-[28px] border border-[var(--color-border)] bg-white/70 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
            Acceso denegado
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)]">
            Esta zona es solo para administradores o asistentes.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            Inicia sesión con una cuenta autorizada para gestionar el panel.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
