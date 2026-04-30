import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { isPortalRole, isStaffRole } from "../../lib/roles";
import type { UserRole } from "../../types/platform";
import { AccessDeniedPage } from "../../pages/public/AccessDeniedPage";

type ProtectedRouteProps = {
  requireStaff?: boolean;
  requirePortal?: boolean;
  allowedRoles?: UserRole[];
};

export function ProtectedRoute({
  requireStaff = false,
  requirePortal = false,
  allowedRoles,
}: ProtectedRouteProps) {
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

  const roleAllowed = allowedRoles ? allowedRoles.includes(role) : true;
  const staffAllowed = !requireStaff || isStaffRole(role);
  const portalAllowed = !requirePortal || isPortalRole(role);

  if (requireStaff && !staffAllowed && isPortalRole(role)) {
    return <Navigate to="/mi-panel" replace />;
  }

  if (requirePortal && !portalAllowed && isStaffRole(role)) {
    return <Navigate to="/panel" replace />;
  }

  if (!roleAllowed || !staffAllowed || !portalAllowed) {
    return <AccessDeniedPage />;
  }

  return <Outlet />;
}
