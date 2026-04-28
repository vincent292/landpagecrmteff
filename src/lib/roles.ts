import type { UserRole } from "../types/platform";

export const staffRoles: UserRole[] = ["superadmin", "doctor", "admin"];

export const roleLabels: Record<UserRole, string> = {
  superadmin: "Superusuario",
  doctor: "Doctora",
  admin: "Administradora",
  user: "Usuario",
};

export function isStaffRole(role: UserRole) {
  return staffRoles.includes(role);
}

export function canManageUsers(role: UserRole) {
  return role === "superadmin";
}

export function normalizeRole(role?: string | null): UserRole {
  if (role === "superadmin" || role === "doctor" || role === "admin" || role === "user") {
    return role;
  }

  if (role === "assistant") return "admin";
  if (role === "patient" || role === "student") return "user";
  return "user";
}
