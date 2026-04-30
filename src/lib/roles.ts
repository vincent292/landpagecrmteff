import type { UserRole } from "../types/platform";

export const staffRoles: UserRole[] = ["superadmin", "doctor", "admin", "assistant"];
export const portalRoles: UserRole[] = ["patient", "student", "user"];

export const roleLabels: Record<UserRole, string> = {
  superadmin: "Superusuario",
  doctor: "Doctora",
  admin: "Administradora",
  assistant: "Asistente",
  patient: "Paciente",
  student: "Estudiante",
  user: "Usuario",
};

export function isStaffRole(role: UserRole) {
  return staffRoles.includes(role);
}

export function isPortalRole(role: UserRole) {
  return portalRoles.includes(role);
}

export function canManageUsers(role: UserRole) {
  return role === "superadmin";
}

export function isSiteAdminRole(role: UserRole) {
  return role === "superadmin" || role === "admin";
}

export function isDoctorRole(role: UserRole) {
  return role === "doctor";
}

export function canManageSite(role: UserRole) {
  return isSiteAdminRole(role);
}

export function canAccessAdminModule(role: UserRole, module: string) {
  if (isSiteAdminRole(role)) return true;
  if (role !== "doctor") return false;

  return [
    "dashboard",
    "pacientes",
    "tratamientos",
    "promociones",
    "cursos",
    "inscripciones",
    "solicitudes",
    "agenda",
    "calendario-citas",
    "disponibilidad",
    "citas",
  ].includes(module);
}

export function normalizeRole(role?: string | null): UserRole {
  if (
    role === "superadmin" ||
    role === "doctor" ||
    role === "admin" ||
    role === "assistant" ||
    role === "patient" ||
    role === "student" ||
    role === "user"
  ) {
    return role;
  }

  return "user";
}
