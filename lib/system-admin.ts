import "server-only";

export function systemAdminAddress() {
  return (
    process.env.SYSTEM_ADMIN_EMAIL ||
    process.env.EMAIL_ADMIN_EMAIL ||
    "abrahamlinkin@126.com"
  ).trim().toLowerCase();
}

export function isSystemAdmin(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase() === systemAdminAddress());
}
