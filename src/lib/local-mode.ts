// Set by electron/main.js only — never in the VPS/web deployment. Lets the
// desktop build skip account creation (single local user, nothing to
// separate per-tenant) instead of the normal multi-user setup/login flow.
export const LOCAL_MODE = process.env.LOCAL_MODE === "1";
export const LOCAL_ADMIN_EMAIL = "local@wasender.local";
