export interface Env {
  DB: D1Database;
  DEVICE_SECRETS?: string;
  TOKEN_AUTH_DEVICES?: string;
  /** Zarezom odvojeni e-mailovi kojima je dopušten admin (i preko Accessa i passkeyem). */
  ADMIN_EMAILS?: string;
  /** npr. "domovina.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** AUD tag Access aplikacije koja štiti /admin/sso */
  ACCESS_AUD?: string;
}

export function adminEmails(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}
