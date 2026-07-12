import { createHash, randomBytes } from "node:crypto";
import type { OAuthStateRepository, TokenRepository, UserRepository } from "../domain/repositories.js";
import type { WhoopTokenSet } from "../domain/models.js";
import type { WhoopGateway } from "../domain/WhoopGateway.js";
import type { WhoopSyncService } from "./WhoopSyncService.js";

const hashState = (state: string): string => createHash("sha256").update(state).digest("hex");

export class WhoopConnectionService {
  public constructor(
    private readonly users: UserRepository,
    private readonly states: OAuthStateRepository,
    private readonly tokens: TokenRepository,
    private readonly whoop: WhoopGateway,
    private readonly sync: Pick<WhoopSyncService, "syncRecent">,
    private readonly initialSyncDays: number,
  ) {}

  public async createAuthorizationUrl(authSubject: string, now = new Date()): Promise<string> {
    const user = await this.users.findOrCreateBySubject(authSubject);
    const state = randomBytes(32).toString("base64url");
    await this.states.create(hashState(state), user.id, new Date(now.getTime() + 10 * 60 * 1000));
    return this.whoop.buildAuthorizationUrl(state);
  }

  public async complete(code: string, state: string, now = new Date()): Promise<string> {
    const userId = await this.states.consume(hashState(state), now);
    if (userId === null) throw new Error("OAUTH_STATE_INVALID");
    const user = await this.users.findById(userId);
    if (user === null) throw new Error("OAUTH_USER_NOT_FOUND");
    const response = await this.whoop.exchangeCode(code);
    const profile = await this.whoop.getProfile(response.accessToken);
    if (user.whoopUserId !== profile.userId) {
      await this.users.attachWhoopUser(user.id, profile.userId, user.version);
    }
    const existing = await this.tokens.find(user.id);
    const tokenSet: WhoopTokenSet = {
      userId: user.id,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: new Date(now.getTime() + response.expiresIn * 1000),
      scopes: response.scopes,
      version: existing?.version ?? 0,
    };
    await this.tokens.upsert(tokenSet, existing?.version ?? null);
    void this.sync.syncRecent(user.id, this.initialSyncDays).catch(() => undefined);
    return user.id;
  }

  public async status(authSubject: string): Promise<{ readonly connected: boolean; readonly authorizationUrl?: string }> {
    const user = await this.users.findOrCreateBySubject(authSubject);
    const token = await this.tokens.find(user.id);
    if (token !== null && user.whoopUserId !== null) return { connected: true };
    return { connected: false, authorizationUrl: await this.createAuthorizationUrl(authSubject) };
  }
}
