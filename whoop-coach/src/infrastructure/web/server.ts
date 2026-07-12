import "dotenv/config";
import express from "express";
import pg from "pg";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { environmentSchema, whoopWebhookSchema } from "../../shared/validation/schemas.js";
import { TokenCipher } from "../security/TokenCipher.js";
import { WebhookVerifier } from "../security/WebhookVerifier.js";
import { Auth0Verifier } from "../security/Auth0Verifier.js";
import { PostgresRepository } from "../db/PostgresRepository.js";
import { WhoopClient } from "../whoop/WhoopClient.js";
import { WhoopSyncService } from "../../application/WhoopSyncService.js";
import { WhoopConnectionService } from "../../application/WhoopConnectionService.js";
import { CoachingService } from "../../application/CoachingService.js";
import { RefreshScheduler } from "../scheduler/RefreshScheduler.js";
import { createCoachMcpServer } from "../mcp/createCoachMcpServer.js";
import { requireAuth, requireRole, type AuthLocals } from "./authMiddleware.js";

const environment = environmentSchema.parse(process.env);
const pool = new pg.Pool({ connectionString: environment.DATABASE_URL });
const repository = new PostgresRepository(pool, new TokenCipher(environment.TOKEN_ENCRYPTION_KEY));
const whoop = new WhoopClient({
  clientId: environment.WHOOP_CLIENT_ID,
  clientSecret: environment.WHOOP_CLIENT_SECRET,
  redirectUri: environment.WHOOP_REDIRECT_URI,
  scopes: environment.WHOOP_SCOPES.split(" ").filter(Boolean),
});
const sync = new WhoopSyncService(repository, repository, repository, repository, whoop);
const connection = new WhoopConnectionService(
  repository,
  repository,
  repository,
  whoop,
  sync,
  environment.WHOOP_INITIAL_SYNC_DAYS,
);
const coaching = new CoachingService(repository, repository, repository);
const auth = new Auth0Verifier(
  environment.AUTH0_ISSUER_BASE_URL,
  environment.AUTH0_AUDIENCE,
  environment.AUTH0_ALLOWED_SUBJECT,
);
const webhookVerifier = new WebhookVerifier(environment.WHOOP_CLIENT_SECRET);
const resourceMetadataUrl = `${environment.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;
const app = express();
app.disable("x-powered-by");

// COMPLIANCE: Public Route — WHOOP authenticates this endpoint with an HMAC signature.
app.post("/webhooks/whoop", express.raw({ type: "application/json", limit: "64kb" }), async (request, response) => {
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
  const signature = request.header("x-whoop-signature") ?? "";
  const timestamp = request.header("x-whoop-signature-timestamp") ?? "";
  if (!webhookVerifier.verify(rawBody, signature, timestamp)) {
    response.status(401).json({ error: "invalid_signature" });
    return;
  }
  let parsedBody: unknown;
  try { parsedBody = JSON.parse(rawBody.toString("utf8")); }
  catch { response.status(400).json({ error: "invalid_json" }); return; }
  const parsed = whoopWebhookSchema.safeParse(parsedBody);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_webhook" });
    return;
  }
  const event = {
    traceId: parsed.data.trace_id,
    whoopUserId: parsed.data.user_id,
    sourceId: parsed.data.id,
    eventType: parsed.data.type,
  };
  const inserted = await repository.enqueue(event);
  response.status(202).json({ accepted: true, duplicate: !inserted });
  if (inserted) void sync.processWebhook(event).catch(() => undefined);
});

app.use(express.json({ limit: "1mb" }));

// COMPLIANCE: Public Route — liveness contains no user or health data.
app.get("/health", (_request, response) => response.json({ status: "ok" }));

// COMPLIANCE: Public Route — OAuth discovery metadata must be publicly discoverable by ChatGPT.
app.get("/.well-known/oauth-protected-resource", (_request, response) => response.json({
  resource: environment.PUBLIC_BASE_URL,
  authorization_servers: [environment.AUTH0_ISSUER_BASE_URL],
  scopes_supported: ["whoop:read"],
  resource_documentation: `${environment.PUBLIC_BASE_URL}/privacy`,
}));

// COMPLIANCE: Public Route — the callback is protected by a one-time, expiring OAuth state.
app.get("/oauth/whoop/callback", async (request, response) => {
  const query = z.object({ code: z.string().min(1), state: z.string().min(8) }).safeParse(request.query);
  if (!query.success) {
    response.status(400).send("WHOOP authorization could not be completed.");
    return;
  }
  try {
    await connection.complete(query.data.code, query.data.state);
    response.type("html").send("<!doctype html><title>WHOOP connected</title><main style='font:18px system-ui;max-width:620px;margin:80px auto;padding:24px'><h1>WHOOP is connected</h1><p>Your initial coaching history is syncing. You can close this tab and return to ChatGPT.</p></main>");
  } catch {
    response.status(400).send("WHOOP authorization expired or failed. Return to ChatGPT and request a new connection link.");
  }
});

// COMPLIANCE: Public Route — concise privacy information contains no user data.
app.get("/privacy", (_request, response) => response.type("text").send(
  "Personal WHOOP Coach stores encrypted OAuth tokens and the minimum WHOOP metrics needed for private coaching. Revoke access from WHOOP at any time.",
));

app.all(
  "/mcp",
  requireAuth(auth, resourceMetadataUrl),
  requireRole("whoop:read"),
  async (request, response) => {
    const locals = response.locals as AuthLocals;
    const server = createCoachMcpServer({
      authSubject: locals.principal.subject,
      publicBaseUrl: environment.PUBLIC_BASE_URL,
      connection,
      coaching,
      sync,
      users: repository,
      reconciliationLookbackDays: environment.WHOOP_RECONCILIATION_LOOKBACK_DAYS,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } finally {
      await transport.close();
      await server.close();
    }
  },
);

new RefreshScheduler(environment.WHOOP_RECONCILIATION_CRON, environment.WHOOP_RECONCILIATION_LOOKBACK_DAYS, sync).start();
const httpServer = app.listen(environment.PORT, "0.0.0.0");

const shutdown = (): void => {
  httpServer.close(() => { void pool.end(); });
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

export { app };
