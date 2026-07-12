import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  CoachProfileRepository,
  OAuthStateRepository,
  RecordRepository,
  TokenRepository,
  UserRepository,
  WebhookEventRepository,
} from "../../domain/repositories.js";
import type { AppUser, CoachProfile, RecordType, WhoopRecord, WhoopTokenSet } from "../../domain/models.js";
import { OptimisticConcurrencyError } from "../../domain/errors.js";
import { TokenCipher } from "../security/TokenCipher.js";

interface UserRow extends QueryResultRow {
  readonly id: string;
  readonly auth_subject: string;
  readonly whoop_user_id: string | null;
  readonly version: number;
}

interface TokenRow extends QueryResultRow {
  readonly user_id: string;
  readonly access_token_ciphertext: string;
  readonly refresh_token_ciphertext: string;
  readonly expires_at: Date;
  readonly scopes: string[];
  readonly version: number;
}

interface RecordRow extends QueryResultRow {
  readonly user_id: string;
  readonly record_type: RecordType;
  readonly source_id: string;
  readonly occurred_at: Date;
  readonly source_updated_at: Date;
  readonly payload: Record<string, unknown>;
  readonly deleted_at: Date | null;
  readonly version: number;
}

interface ProfileRow extends QueryResultRow {
  readonly user_id: string;
  readonly primary_sport: string;
  readonly goals: string[];
  readonly weekly_schedule: Record<string, unknown>;
  readonly injury_constraints: string[];
  readonly target_event_date: string | null;
  readonly version: number;
}

const mapUser = (row: UserRow): AppUser => ({
  id: row.id,
  authSubject: row.auth_subject,
  whoopUserId: row.whoop_user_id === null ? null : Number(row.whoop_user_id),
  version: row.version,
});

export class PostgresRepository implements
  UserRepository,
  OAuthStateRepository,
  TokenRepository,
  RecordRepository,
  CoachProfileRepository,
  WebhookEventRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly tokenCipher: TokenCipher,
  ) {}

  public async findOrCreateBySubject(authSubject: string): Promise<AppUser> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO app_users (auth_subject)
       VALUES ($1)
       ON CONFLICT (auth_subject) DO UPDATE SET updated_at = app_users.updated_at
       RETURNING id, auth_subject, whoop_user_id, version`,
      [authSubject],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("USER_UPSERT_FAILED");
    return mapUser(row);
  }

  public async findByWhoopUserId(whoopUserId: number): Promise<AppUser | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT id, auth_subject, whoop_user_id, version FROM app_users WHERE whoop_user_id = $1",
      [whoopUserId],
    );
    return result.rows[0] === undefined ? null : mapUser(result.rows[0]);
  }

  public async findById(userId: string): Promise<AppUser | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT id, auth_subject, whoop_user_id, version FROM app_users WHERE id = $1",
      [userId],
    );
    return result.rows[0] === undefined ? null : mapUser(result.rows[0]);
  }

  public async attachWhoopUser(userId: string, whoopUserId: number, expectedVersion: number): Promise<AppUser> {
    const result = await this.pool.query<UserRow>(
      `UPDATE app_users
       SET whoop_user_id = $2, updated_at = now(), version = version + 1
       WHERE id = $1 AND version = $3
       RETURNING id, auth_subject, whoop_user_id, version`,
      [userId, whoopUserId, expectedVersion],
    );
    const row = result.rows[0];
    if (row === undefined) throw new OptimisticConcurrencyError();
    return mapUser(row);
  }

  public async listConnected(): Promise<readonly AppUser[]> {
    const result = await this.pool.query<UserRow>(
      "SELECT id, auth_subject, whoop_user_id, version FROM app_users WHERE whoop_user_id IS NOT NULL",
    );
    return result.rows.map(mapUser);
  }

  public async create(stateHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      "INSERT INTO oauth_states (state_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [stateHash, userId, expiresAt],
    );
  }

  public async consume(stateHash: string, now: Date): Promise<string | null> {
    const result = await this.pool.query<{ readonly user_id: string }>(
      `UPDATE oauth_states
       SET consumed_at = $2
       WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > $2
       RETURNING user_id`,
      [stateHash, now],
    );
    return result.rows[0]?.user_id ?? null;
  }

  public async find(userId: string): Promise<WhoopTokenSet | null> {
    const result = await this.pool.query<TokenRow>(
      `SELECT user_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, scopes, version
       FROM whoop_tokens WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return {
      userId: row.user_id,
      accessToken: this.tokenCipher.decrypt(row.access_token_ciphertext),
      refreshToken: this.tokenCipher.decrypt(row.refresh_token_ciphertext),
      expiresAt: row.expires_at,
      scopes: row.scopes,
      version: row.version,
    };
  }

  public async upsert(tokenSet: WhoopTokenSet, expectedVersion: number | null): Promise<WhoopTokenSet> {
    const accessCiphertext = this.tokenCipher.encrypt(tokenSet.accessToken);
    const refreshCiphertext = this.tokenCipher.encrypt(tokenSet.refreshToken);
    const result = expectedVersion === null
      ? await this.pool.query<TokenRow>(
        `INSERT INTO whoop_tokens
          (user_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, scopes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING user_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, scopes, version`,
        [tokenSet.userId, accessCiphertext, refreshCiphertext, tokenSet.expiresAt, [...tokenSet.scopes]],
      )
      : await this.pool.query<TokenRow>(
        `UPDATE whoop_tokens
         SET access_token_ciphertext = $2, refresh_token_ciphertext = $3, expires_at = $4,
             scopes = $5, updated_at = now(), version = version + 1
         WHERE user_id = $1 AND version = $6
         RETURNING user_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, scopes, version`,
        [tokenSet.userId, accessCiphertext, refreshCiphertext, tokenSet.expiresAt, [...tokenSet.scopes], expectedVersion],
      );
    const row = result.rows[0];
    if (row === undefined) throw new OptimisticConcurrencyError("WHOOP tokens changed during rotation.");
    return { ...tokenSet, version: row.version };
  }

  public async delete(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM whoop_tokens WHERE user_id = $1", [userId]);
  }

  public async upsertRecord(record: WhoopRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO whoop_records
        (user_id, record_type, source_id, occurred_at, source_updated_at, payload, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL)
       ON CONFLICT (user_id, record_type, source_id) DO UPDATE
       SET occurred_at = EXCLUDED.occurred_at,
           source_updated_at = EXCLUDED.source_updated_at,
           payload = EXCLUDED.payload,
           deleted_at = NULL,
           version = whoop_records.version + 1
       WHERE whoop_records.source_updated_at <= EXCLUDED.source_updated_at`,
      [record.userId, record.recordType, record.sourceId, record.occurredAt, record.sourceUpdatedAt, record.payload],
    );
  }

  public async markDeleted(userId: string, type: RecordType, sourceId: string, deletedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE whoop_records SET deleted_at = $4, version = version + 1
       WHERE user_id = $1 AND record_type = $2 AND source_id = $3`,
      [userId, type, sourceId, deletedAt],
    );
  }

  public async listSince(userId: string, since: Date): Promise<readonly WhoopRecord[]> {
    const result = await this.pool.query<RecordRow>(
      `SELECT user_id, record_type, source_id, occurred_at, source_updated_at, payload, deleted_at, version
       FROM whoop_records WHERE user_id = $1 AND occurred_at >= $2 ORDER BY occurred_at ASC`,
      [userId, since],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      recordType: row.record_type,
      sourceId: row.source_id,
      occurredAt: row.occurred_at,
      sourceUpdatedAt: row.source_updated_at,
      payload: Object.freeze({ ...row.payload }),
      deletedAt: row.deleted_at,
      version: row.version,
    }));
  }

  public async save(profile: CoachProfile, expectedVersion: number | null): Promise<CoachProfile> {
    const result = expectedVersion === null
      ? await this.pool.query<ProfileRow>(
        `INSERT INTO coach_profiles
          (user_id, primary_sport, goals, weekly_schedule, injury_constraints, target_event_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING user_id, primary_sport, goals, weekly_schedule, injury_constraints, target_event_date, version`,
        [profile.userId, profile.primarySport, [...profile.goals], profile.weeklySchedule, [...profile.injuryConstraints], profile.targetEventDate],
      )
      : await this.pool.query<ProfileRow>(
        `UPDATE coach_profiles
         SET primary_sport = $2, goals = $3, weekly_schedule = $4, injury_constraints = $5,
             target_event_date = $6, updated_at = now(), version = version + 1
         WHERE user_id = $1 AND version = $7
         RETURNING user_id, primary_sport, goals, weekly_schedule, injury_constraints, target_event_date, version`,
        [profile.userId, profile.primarySport, [...profile.goals], profile.weeklySchedule, [...profile.injuryConstraints], profile.targetEventDate, expectedVersion],
      );
    const row = result.rows[0];
    if (row === undefined) throw new OptimisticConcurrencyError();
    return this.mapProfile(row);
  }

  public async findProfile(userId: string): Promise<CoachProfile | null> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT user_id, primary_sport, goals, weekly_schedule, injury_constraints, target_event_date, version
       FROM coach_profiles WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] === undefined ? null : this.mapProfile(result.rows[0]);
  }

  public async enqueue(event: {
    readonly traceId: string;
    readonly whoopUserId: number;
    readonly sourceId: string;
    readonly eventType: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO webhook_events (trace_id, whoop_user_id, source_id, event_type)
       VALUES ($1, $2, $3, $4) ON CONFLICT (trace_id) DO NOTHING`,
      [event.traceId, event.whoopUserId, event.sourceId, event.eventType],
    );
    return result.rowCount === 1;
  }

  public async markProcessed(traceId: string): Promise<void> {
    await this.pool.query(
      "UPDATE webhook_events SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE trace_id = $1",
      [traceId],
    );
  }

  public async markFailed(traceId: string, safeErrorCode: string): Promise<void> {
    await this.pool.query(
      "UPDATE webhook_events SET attempts = attempts + 1, last_error = $2 WHERE trace_id = $1",
      [traceId, safeErrorCode.slice(0, 100)],
    );
  }

  public async withReadCommitted<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const value = await operation(client);
      await client.query("COMMIT");
      return value;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private mapProfile(row: ProfileRow): CoachProfile {
    return {
      userId: row.user_id,
      primarySport: row.primary_sport,
      goals: row.goals,
      weeklySchedule: Object.freeze({ ...row.weekly_schedule }),
      injuryConstraints: row.injury_constraints,
      targetEventDate: row.target_event_date,
      version: row.version,
    };
  }
}
