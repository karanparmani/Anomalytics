import type { AppUser, CoachProfile, RecordType, WhoopRecord, WhoopTokenSet } from "./models.js";

export interface UserRepository {
  findOrCreateBySubject(authSubject: string): Promise<AppUser>;
  findById(userId: string): Promise<AppUser | null>;
  findByWhoopUserId(whoopUserId: number): Promise<AppUser | null>;
  attachWhoopUser(userId: string, whoopUserId: number, expectedVersion: number): Promise<AppUser>;
  listConnected(): Promise<readonly AppUser[]>;
}

export interface OAuthStateRepository {
  create(stateHash: string, userId: string, expiresAt: Date): Promise<void>;
  consume(stateHash: string, now: Date): Promise<string | null>;
}

export interface TokenRepository {
  find(userId: string): Promise<WhoopTokenSet | null>;
  upsert(tokenSet: WhoopTokenSet, expectedVersion: number | null): Promise<WhoopTokenSet>;
  delete(userId: string): Promise<void>;
}

export interface RecordRepository {
  upsertRecord(record: WhoopRecord): Promise<void>;
  markDeleted(userId: string, type: RecordType, sourceId: string, deletedAt: Date): Promise<void>;
  listSince(userId: string, since: Date): Promise<readonly WhoopRecord[]>;
}

export interface CoachProfileRepository {
  findProfile(userId: string): Promise<CoachProfile | null>;
  save(profile: CoachProfile, expectedVersion: number | null): Promise<CoachProfile>;
}

export interface WebhookEventRepository {
  enqueue(event: {
    readonly traceId: string;
    readonly whoopUserId: number;
    readonly sourceId: string;
    readonly eventType: string;
  }): Promise<boolean>;
  markProcessed(traceId: string): Promise<void>;
  markFailed(traceId: string, safeErrorCode: string): Promise<void>;
}
