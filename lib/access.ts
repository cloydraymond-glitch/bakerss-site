export type AppRole =
  | "admin"
  | "manager"
  | "employee"
  | "technician"
  | "staff"
  | "client"
  | "unknown";

export function normalizeRole(role: string | null | undefined): AppRole {
  const normalized = role?.trim().toLowerCase() || "";

  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "employee") return "employee";
  if (normalized === "technician") return "technician";
  if (normalized === "staff") return "staff";
  if (normalized === "client") return "client";

  return "unknown";
}

export function isAdminRole(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function isEmployeeRole(role: AppRole) {
  return role === "employee" || role === "technician" || role === "staff";
}

export function isClientRole(role: AppRole) {
  return role === "client";
}

export function landingPathForRole(role: AppRole) {
  if (isAdminRole(role)) return "/";
  if (isEmployeeRole(role)) return "/technician";
  if (isClientRole(role)) return "/portal";
  return "/login";
}

export function isPublicRoute(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/")
  );
}

export function isTechnicianRoute(pathname: string) {
  return pathname === "/technician" || pathname.startsWith("/technician/");
}

export function isClientPortalRoute(pathname: string) {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}
