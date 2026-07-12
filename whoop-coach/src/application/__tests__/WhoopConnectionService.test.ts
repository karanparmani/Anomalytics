import { describe, expect, it, vi } from "vitest";
import type { AppUser, RecordType, WhoopRecord, WhoopTokenSet } from "../../domain/models.js";
import type { OAuthStateRepository, TokenRepository, UserRepository } from "../../domain/repositories.js";
import type { WhoopGateway } from "../../domain/WhoopGateway.js";
import { WhoopConnectionService } from "../WhoopConnectionService.js";

class MemoryUsers implements UserRepository {
  public user: AppUser = { id: "00000000-0000-4000-8000-000000000001", authSubject: "auth0|me", whoopUserId: null, version: 0 };
  public async findOrCreateBySubject(): Promise<AppUser> { return this.user; }
  public async findById(): Promise<AppUser | null> { return this.user; }
  public async findByWhoopUserId(): Promise<AppUser | null> { return this.user; }
  public async attachWhoopUser(_userId: string, whoopUserId: number): Promise<AppUser> {
    this.user = { ...this.user, whoopUserId, version: this.user.version + 1 };
    return this.user;
  }
  public async listConnected(): Promise<readonly AppUser[]> { return [this.user]; }
}

class MemoryStates implements OAuthStateRepository {
  public userId: string | null = null;
  public async create(_stateHash: string, userId: string): Promise<void> { this.userId = userId; }
  public async consume(): Promise<string | null> { const value = this.userId; this.userId = null; return value; }
}

class MemoryTokens implements TokenRepository {
  public value: WhoopTokenSet | null = null;
  public async find(): Promise<WhoopTokenSet | null> { return this.value; }
  public async upsert(tokenSet: WhoopTokenSet): Promise<WhoopTokenSet> { this.value = { ...tokenSet, version: 0 }; return this.value; }
  public async delete(): Promise<void> { this.value = null; }
}

const gateway: WhoopGateway = {
  buildAuthorizationUrl: (state) => `https://api.prod.whoop.com/oauth/oauth2/auth?state=${state}`,
  exchangeCode: async () => ({ accessToken: "access", refreshToken: "refresh", expiresIn: 3600, scopes: ["offline"] }),
  refresh: async () => ({ accessToken: "access-2", refreshToken: "refresh-2", expiresIn: 3600, scopes: ["offline"] }),
  getProfile: async () => ({ userId: 12345 }),
  fetchCollection: async (_accessToken: string, _userId: string, _type: RecordType): Promise<readonly WhoopRecord[]> => [],
  fetchById: async (): Promise<WhoopRecord> => { throw new Error("not used"); },
};

describe("WhoopConnectionService", () => {
  it("creates a one-time WHOOP authorization URL", async () => {
    const service = new WhoopConnectionService(new MemoryUsers(), new MemoryStates(), new MemoryTokens(), gateway, { syncRecent: vi.fn() }, 90);
    const status = await service.status("auth0|me");
    expect(status.connected).toBe(false);
    expect(status.authorizationUrl).toMatch(/^https:\/\/api\.prod\.whoop\.com/);
  });

  it("stores rotating credentials and starts the initial sync after callback", async () => {
    const users = new MemoryUsers();
    const states = new MemoryStates();
    const tokens = new MemoryTokens();
    const syncRecent = vi.fn().mockResolvedValue(0);
    const service = new WhoopConnectionService(users, states, tokens, gateway, { syncRecent }, 90);
    const authorizationUrl = await service.createAuthorizationUrl("auth0|me");
    const state = new URL(authorizationUrl).searchParams.get("state");
    expect(state).not.toBeNull();
    await service.complete("code", state ?? "");
    expect(users.user.whoopUserId).toBe(12345);
    expect(tokens.value?.refreshToken).toBe("refresh");
    expect(syncRecent).toHaveBeenCalledWith(users.user.id, 90);
  });
});
