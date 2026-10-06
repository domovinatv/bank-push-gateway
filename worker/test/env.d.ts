declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DEVICE_SECRETS: string;
    TOKEN_AUTH_DEVICES: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
