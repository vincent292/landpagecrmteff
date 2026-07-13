import type { UserRole } from "../types/platform";

export const staffRoles: UserRole[] = ["superadmin", "doctor", "doctor_inventory", "admin", "assistant"];
export const portalRoles: UserRole[] = ["patient", "student", "user"];

export const roleLabels: Record<UserRole, string> = {
  superadmin: "Superusuario",
  doctor: "Doctora",
  doctor_inventory: "Doctora + inventario",
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
  return role === "superadmin" || role === "admin";
}

export function isSiteAdminRole(role: UserRole) {
  return role === "superadmin" || role === "admin";
}

export function isDoctorRole(role: UserRole) {
  return role === "doctor" || role === "doctor_inventory";
}

export function canManageInventoryAsDoctor(role: UserRole) {
  return role === "doctor_inventory";
}

export function isAssistantRole(role: UserRole) {
  return role === "assistant";
}

export function canManageSite(role: UserRole) {
  return isSiteAdminRole(role);
}

export function canAccessAdminModule(role: UserRole, module: string) {
  if (isSiteAdminRole(role)) return true;
  if (role === "assistant") {
    return [
      "dashboard",
      "pacientes",
      "inscripciones",
      "solicitudes",
      "agenda",
      "calendario-citas",
      "disponibilidad",
      "citas",
      "pagos-reservas",
      "reportes-operativos",
      "calificaciones",
      "planes-pago",
      "tarjetas-ahorro",
      "tokens-libros",
      "libros",
      "inventario",
    ].includes(module);
  }
  if (!isDoctorRole(role)) return false;

  return [
    "dashboard",
    "mi-perfil",
    "pacientes",
    "libros",
    "tratamientos",
    "promociones",
    "cursos",
    "agenda",
    "calendario-citas",
    "disponibilidad",
    "citas",
    "galeria",
    ...(canManageInventoryAsDoctor(role) ? ["inventario"] : []),
  ].includes(module);
}

export function normalizeRole(role?: string | null): UserRole {
  if (
    role === "superadmin" ||
    role === "doctor" ||
    role === "doctor_inventory" ||
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
