import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AppUser, CoachingDashboard } from "../../../domain/models.js";
import type { UserRepository } from "../../../domain/repositories.js";
import { createCoachMcpServer } from "../createCoachMcpServer.js";

const dashboard: CoachingDashboard = {
  generatedAt: "2026-07-12T12:00:00.000Z",
  readiness: "green",
  headline: "Ready for purposeful training",
  today: { date: "2026-07-12", recoveryScore: 80, hrvMs: 65, restingHeartRate: 48, sleepPerformance: 92, dayStrain: 10, workoutStrain: 8 },
  baselines: { hrv28dMedian: 62, restingHeartRate28dMedian: 49, sleepPerformance14dAverage: 88, strain7dAverage: 11 },
  history: [],
  insights: [],
  profile: null,
  disclaimer: "Training guidance only.",
};

const user: AppUser = { id: "00000000-0000-4000-8000-000000000001", authSubject: "auth0|me", whoopUserId: 123, version: 0 };
const users: UserRepository = {
  findOrCreateBySubject: async () => user,
  findById: async () => user,
  findByWhoopUserId: async () => user,
  attachWhoopUser: async () => user,
  listConnected: async () => [user],
};

describe("coach MCP contract", () => {
  it("advertises the dashboard plus standard search and fetch tools", async () => {
    const server = createCoachMcpServer({
      authSubject: "auth0|me",
      publicBaseUrl: "https://coach.example.com",
      connection: { status: async () => ({ connected: true }) },
      coaching: {
        dashboard: async () => dashboard,
        saveProfile: async (_subject, input) => ({ ...input, userId: user.id, version: 0 }),
      },
      sync: { syncRecent: async () => 0 },
      users,
      reconciliationLookbackDays: 7,
    });
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["show_coaching_dashboard", "search", "fetch", "refresh_whoop_data"]));
    const dashboardTool = listed.tools.find((tool) => tool.name === "show_coaching_dashboard");
    expect(dashboardTool?._meta?.ui).toMatchObject({ resourceUri: "ui://whoop-coach/dashboard-v1.html" });
    const resource = await client.readResource({ uri: "ui://whoop-coach/dashboard-v1.html" });
    expect(resource.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
    const firstContent = resource.contents[0];
    const html = firstContent !== undefined && "text" in firstContent ? firstContent.text : "";
    expect(html).toContain("Personal WHOOP Coach");
    await client.close();
    await server.close();
  });
});
