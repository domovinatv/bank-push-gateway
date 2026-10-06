// LiveFeed: jedan Durable Object na koji se spajaju svi otvoreni admini
// (WebSocket) i kojem /ingest i /heartbeat javljaju nove zapise.
//
// Hibernation API: DO ne drži memoriju ni naplatu dok veze miruju; budi se
// samo kad stigne broadcast ili poruka.
//
// Auth se radi u Workeru prije prosljeđivanja (sesija + Origin). Ovdje se uz
// svaku vezu pamti istek sesije i veza se zatvara kad istekne.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

interface Attachment {
  email: string;
  expiresAt: string;
}

export const LIVE_FEED_NAME = "admin";

export class LiveFeed extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive klijenta bez buđenja DO-a.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const email = request.headers.get("x-admin-email");
    const expiresAt = request.headers.get("x-admin-session-expires");
    if (!email || !expiresAt) return new Response("forbidden", { status: 403 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ email, expiresAt } satisfies Attachment);
    server.send(JSON.stringify({ type: "hello", at: new Date().toISOString() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC iz Workera. Vraća broj veza kojima je poruka poslana. */
  async broadcast(message: string): Promise<number> {
    const now = new Date().toISOString();
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att || att.expiresAt < now) {
        ws.close(4401, "session expired");
        continue;
      }
      try {
        ws.send(message);
        sent++;
      } catch {
        /* veza se upravo zatvara */
      }
    }
    return sent;
  }

  async webSocketMessage(): Promise<void> {
    // Klijent ništa ne šalje osim "ping" (auto-response gore).
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* već zatvoreno */
    }
  }
}

export function liveFeed(env: Env) {
  return env.LIVE_FEED.get(env.LIVE_FEED.idFromName(LIVE_FEED_NAME));
}
