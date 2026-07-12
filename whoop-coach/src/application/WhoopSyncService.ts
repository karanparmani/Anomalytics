import { OptimisticConcurrencyError, WhoopConnectionRequiredError } from "../domain/errors.js";
import type { RecordType, WhoopTokenSet } from "../domain/models.js";
import type { RecordRepository, TokenRepository, UserRepository, WebhookEventRepository } from "../domain/repositories.js";
import type { WhoopGateway } from "../domain/WhoopGateway.js";

const syncTypes: readonly RecordType[] = ["cycle", "recovery", "sleep", "workout", "body"];

export class WhoopSyncService {
  public constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenRepository,
    private readonly records: RecordRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly whoop: WhoopGateway,
  ) {}

  public async syncRecent(userId: string, lookbackDays: number, now = new Date()): Promise<number> {
    const token = await this.getValidToken(userId, now);
    const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    let count = 0;
    for (const type of syncTypes) {
      const fetched = await this.whoop.fetchCollection(token.accessToken, userId, type, start, now);
      for (const record of fetched) {
        await this.records.upsertRecord(record);
        count += 1;
      }
    }
    return count;
  }

  public async processWebhook(event: {
    readonly traceId: string;
    readonly whoopUserId: number;
    readonly sourceId: string;
    readonly eventType: string;
  }, now = new Date()): Promise<void> {
    const user = await this.users.findByWhoopUserId(event.whoopUserId);
    if (user === null) {
      await this.webhookEvents.markFailed(event.traceId, "UNKNOWN_WHOOP_USER");
      return;
    }
    const [entity, action] = event.eventType.split(".");
    const type = entity === "sleep" || entity === "workout" || entity === "recovery" ? entity : null;
    if (type === null) {
      await this.webhookEvents.markFailed(event.traceId, "UNKNOWN_EVENT_TYPE");
      return;
    }
    try {
      if (action === "deleted") {
        await this.records.markDeleted(user.id, type, event.sourceId, now);
      } else if (type === "recovery") {
        const token = await this.getValidToken(user.id, now);
        const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const recoveries = await this.whoop.fetchCollection(token.accessToken, user.id, "recovery", start, now);
        for (const recovery of recoveries) await this.records.upsertRecord(recovery);
      } else {
        const token = await this.getValidToken(user.id, now);
        await this.records.upsertRecord(await this.whoop.fetchById(token.accessToken, user.id, type, event.sourceId));
      }
      await this.webhookEvents.markProcessed(event.traceId);
    } catch (error: unknown) {
      const safeCode = error instanceof Error && /^WHOOP_[A-Z0-9_]+$/.test(error.message) ? error.message : "WEBHOOK_PROCESSING_FAILED";
      await this.webhookEvents.markFailed(event.traceId, safeCode);
      throw error;
    }
  }

  public async reconcileAll(lookbackDays: number): Promise<void> {
    for (const user of await this.users.listConnected()) {
      try {
        await this.syncRecent(user.id, lookbackDays);
      } catch {
        // A failed user sync is isolated; the next scheduled run retries it.
      }
    }
  }

  private async getValidToken(userId: string, now: Date): Promise<WhoopTokenSet> {
    const current = await this.tokens.find(userId);
    if (current === null) throw new WhoopConnectionRequiredError();
    if (current.expiresAt.getTime() > now.getTime() + 5 * 60 * 1000) return current;

    const rotated = await this.whoop.refresh(current.refreshToken);
    const candidate: WhoopTokenSet = {
      userId,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresAt: new Date(now.getTime() + rotated.expiresIn * 1000),
      scopes: rotated.scopes,
      version: current.version,
    };
    try {
      return await this.tokens.upsert(candidate, current.version);
    } catch (error: unknown) {
      if (!(error instanceof OptimisticConcurrencyError)) throw error;
      const winner = await this.tokens.find(userId);
      if (winner === null) throw new WhoopConnectionRequiredError();
      return winner;
    }
  }
}
