import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { CoachingService } from "../../application/CoachingService.js";
import type { WhoopConnectionService } from "../../application/WhoopConnectionService.js";
import type { WhoopSyncService } from "../../application/WhoopSyncService.js";
import type { UserRepository } from "../../domain/repositories.js";
import { updateCoachProfileSchema } from "../../shared/validation/schemas.js";

const WIDGET_URI = "ui://whoop-coach/dashboard-v1.html";
const toolSecurity = [{ type: "oauth2", scopes: ["whoop:read"] }] as const;

export interface CoachMcpDependencies {
  readonly authSubject: string;
  readonly publicBaseUrl: string;
  readonly connection: Pick<WhoopConnectionService, "status">;
  readonly coaching: Pick<CoachingService, "dashboard" | "saveProfile">;
  readonly sync: Pick<WhoopSyncService, "syncRecent">;
  readonly users: UserRepository;
  readonly reconciliationLookbackDays: number;
}

const securedMeta = (additional: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  securitySchemes: toolSecurity,
  ...additional,
});

export const createCoachMcpServer = (dependencies: CoachMcpDependencies): McpServer => {
  const server = new McpServer({ name: "personal-whoop-coach", version: "0.1.0" });
  const widgetPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../public/coaching-widget.html");

  registerAppResource(
    server,
    "WHOOP coaching dashboard",
    WIDGET_URI,
    { description: "Interactive readiness, recovery, sleep, and training dashboard." },
    async () => ({
      contents: [{
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(widgetPath, "utf8"),
        _meta: {
          ui: {
            csp: { connectDomains: [], resourceDomains: [] },
            prefersBorder: true,
          },
          "openai/widgetDescription": "A private WHOOP coaching dashboard with readiness, physiological baselines, trends, and concrete next actions.",
        },
      }],
    }),
  );

  registerAppTool(
    server,
    "show_coaching_dashboard",
    {
      title: "Show WHOOP coaching dashboard",
      description: "Use this when the user wants current WHOOP recovery, training readiness, trends, or a visual coaching summary.",
      inputSchema: { days: z.number().int().min(14).max(90).default(42) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securedMeta({
        ui: { resourceUri: WIDGET_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Reviewing WHOOP trends…",
        "openai/toolInvocation/invoked": "Coaching dashboard ready",
      }),
    },
    async ({ days }) => {
      const status = await dependencies.connection.status(dependencies.authSubject);
      if (!status.connected) {
        const payload = { connected: false, authorizationUrl: status.authorizationUrl, refreshCount: Date.now() };
        return {
          structuredContent: payload,
          content: [{ type: "text", text: "Connect WHOOP to begin personalized coaching." }],
          _meta: { authorizationUrl: status.authorizationUrl },
        };
      }
      const dashboard = await dependencies.coaching.dashboard(dependencies.authSubject, days);
      return {
        structuredContent: { connected: true, dashboard, refreshCount: Date.now() },
        content: [{ type: "text", text: `${dashboard.headline}. ${dashboard.insights[0]?.action ?? "Review the dashboard for details."}` }],
        _meta: {},
      };
    },
  );

  server.registerTool(
    "whoop_connection_status",
    {
      title: "Check WHOOP connection",
      description: "Use this when the user asks whether WHOOP is connected or needs a fresh authorization link.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securedMeta(),
    },
    async () => {
      const status = await dependencies.connection.status(dependencies.authSubject);
      return {
        structuredContent: status,
        content: [{ type: "text", text: status.connected ? "WHOOP is connected." : "WHOOP needs to be connected." }],
        _meta: status.connected ? {} : { authorizationUrl: status.authorizationUrl },
      };
    },
  );

  server.registerTool(
    "refresh_whoop_data",
    {
      title: "Refresh WHOOP data",
      description: "Use this when the user explicitly asks to refresh or reconcile their latest WHOOP recovery, sleep, strain, and workout data.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
      _meta: securedMeta({ "openai/toolInvocation/invoking": "Refreshing WHOOP…", "openai/toolInvocation/invoked": "WHOOP is current" }),
    },
    async () => {
      const user = await dependencies.users.findOrCreateBySubject(dependencies.authSubject);
      const recordsUpdated = await dependencies.sync.syncRecent(user.id, dependencies.reconciliationLookbackDays);
      return {
        structuredContent: { recordsUpdated, refreshedAt: new Date().toISOString() },
        content: [{ type: "text", text: `WHOOP refresh completed; ${recordsUpdated} records were reconciled.` }],
      };
    },
  );

  server.registerTool(
    "update_coaching_profile",
    {
      title: "Update coaching profile",
      description: "Use this when the user wants to save their sport, goals, weekly schedule, target event, or training constraints.",
      inputSchema: updateCoachProfileSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securedMeta(),
    },
    async (input) => {
      const parsed = updateCoachProfileSchema.parse(input);
      const profile = await dependencies.coaching.saveProfile(dependencies.authSubject, parsed);
      return {
        structuredContent: { profile },
        content: [{ type: "text", text: "Your coaching profile has been updated." }],
      };
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search WHOOP coaching days",
      description: "Use this when searching the user's WHOOP coaching history for dates or daily readiness summaries.",
      inputSchema: { query: z.string().max(200) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securedMeta(),
    },
    async ({ query }) => {
      const dashboard = await dependencies.coaching.dashboard(dependencies.authSubject, 90);
      const normalized = query.trim().toLowerCase();
      const results = dashboard.history
        .filter((metric) => normalized.length === 0 || metric.date.includes(normalized))
        .slice(-25)
        .reverse()
        .map((metric) => ({
          id: `day:${metric.date}`,
          title: `${metric.date} — recovery ${metric.recoveryScore ?? "unscored"}`,
          url: `${dependencies.publicBaseUrl}/#day=${metric.date}`,
        }));
      return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch WHOOP coaching day",
      description: "Use this when retrieving a specific daily WHOOP coaching summary returned by search.",
      inputSchema: { id: z.string().regex(/^day:\d{4}-\d{2}-\d{2}$/) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securedMeta(),
    },
    async ({ id }) => {
      const date = id.slice(4);
      const dashboard = await dependencies.coaching.dashboard(dependencies.authSubject, 90);
      const metric = dashboard.history.find((entry) => entry.date === date);
      const payload = {
        id,
        title: `WHOOP coaching summary for ${date}`,
        text: metric === undefined ? "No WHOOP data was found for this date." : JSON.stringify(metric),
        url: `${dependencies.publicBaseUrl}/#day=${date}`,
        metadata: { generatedAt: dashboard.generatedAt },
      };
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );

  return server;
};
