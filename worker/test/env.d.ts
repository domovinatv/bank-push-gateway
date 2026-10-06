declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    LIVE_FEED: DurableObjectNamespace<import("../src/live").LiveFeed>;
    DEVICE_SECRETS: string;
    TOKEN_AUTH_DEVICES: string;
    ADMIN_EMAILS: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
