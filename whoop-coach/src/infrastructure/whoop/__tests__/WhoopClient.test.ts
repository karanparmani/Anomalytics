import { describe, expect, it, vi } from "vitest";
import { WhoopClient } from "../WhoopClient.js";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://coach.example.com/oauth/whoop/callback",
  scopes: ["offline", "read:recovery"],
} as const;

describe("WhoopClient", () => {
  it("includes offline scope and CSRF state in the authorization URL", () => {
    const url = new URL(new WhoopClient(config).buildAuthorizationUrl("12345678-state"));
    expect(url.searchParams.get("state")).toBe("12345678-state");
    expect(url.searchParams.get("scope")).toContain("offline");
  });

  it("rotates refresh tokens from the token response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      scope: "offline read:recovery",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new WhoopClient(config, fetcher);
    await expect(client.refresh("old-refresh")).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
  });
});
