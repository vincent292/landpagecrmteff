import { isDoctorRole } from "./roles";
import type { UserRole } from "../types/platform";

export function shouldHidePatientPhone(role?: UserRole | null) {
  return role ? isDoctorRole(role) : false;
}

export function sanitizePatientPhone<T extends { phone: string | null }>(
  row: T | null | undefined,
  role?: UserRole | null
) {
  if (!row || !shouldHidePatientPhone(role)) return row;
  return { ...row, phone: null } as T;
}
