import type { RecordType, WhoopRecord } from "../../domain/models.js";
import type { WhoopGateway } from "../../domain/WhoopGateway.js";

const API_BASE = "https://api.prod.whoop.com/developer/v2";
const AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const stringValue = (value: unknown, fallback: string): string => typeof value === "string" ? value : fallback;
const numberValue = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export interface OAuthTokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly scopes: readonly string[];
}

export interface WhoopProfile {
  readonly userId: number;
}

export interface WhoopClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

const endpointByType: Readonly<Record<RecordType, string>> = {
  cycle: "/cycle",
  recovery: "/recovery",
  sleep: "/activity/sleep",
  workout: "/activity/workout",
  body: "/user/measurement/body",
};

export class WhoopClient implements WhoopGateway {
  public constructor(
    private readonly config: WhoopClientConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public buildAuthorizationUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  public exchangeCode(code: string): Promise<OAuthTokenResponse> {
    return this.tokenRequest(new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    }));
  }

  public refresh(refreshToken: string): Promise<OAuthTokenResponse> {
    return this.tokenRequest(new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: this.config.scopes.join(" "),
    }));
  }

  public async getProfile(accessToken: string): Promise<WhoopProfile> {
    const payload = await this.getJson(`${API_BASE}/user/profile/basic`, accessToken);
    const userId = isObject(payload) ? numberValue(payload.user_id) : null;
    if (userId === null) throw new Error("WHOOP_PROFILE_INVALID");
    return { userId };
  }

  public async fetchCollection(
    accessToken: string,
    userId: string,
    recordType: RecordType,
    start: Date,
    end: Date,
  ): Promise<readonly WhoopRecord[]> {
    if (recordType === "body") {
      const payload = await this.getJson(`${API_BASE}${endpointByType.body}`, accessToken);
      return [this.toRecord(userId, "body", payload)];
    }

    const records: WhoopRecord[] = [];
    let nextToken: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const url = new URL(`${API_BASE}${endpointByType[recordType]}`);
      url.searchParams.set("limit", "25");
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("end", end.toISOString());
      if (nextToken !== null) url.searchParams.set("nextToken", nextToken);
      const payload = await this.getJson(url.toString(), accessToken);
      if (!isObject(payload) || !Array.isArray(payload.records)) throw new Error("WHOOP_COLLECTION_INVALID");
      for (const item of payload.records) records.push(this.toRecord(userId, recordType, item));
      nextToken = typeof payload.next_token === "string" && payload.next_token.length > 0 ? payload.next_token : null;
      if (nextToken === null) return records;
    }
    throw new Error("WHOOP_PAGINATION_LIMIT");
  }

  public async fetchById(
    accessToken: string,
    userId: string,
    recordType: Exclude<RecordType, "body" | "cycle">,
    sourceId: string,
  ): Promise<WhoopRecord> {
    const encodedId = encodeURIComponent(sourceId);
    const suffix = recordType === "recovery" ? `/recovery/${encodedId}` : `${endpointByType[recordType]}/${encodedId}`;
    return this.toRecord(userId, recordType, await this.getJson(`${API_BASE}${suffix}`, accessToken));
  }

  private async tokenRequest(body: URLSearchParams): Promise<OAuthTokenResponse> {
    const response = await this.fetcher(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isObject(payload)) throw new Error(`WHOOP_TOKEN_${response.status}`);
    const accessToken = payload.access_token;
    const refreshToken = payload.refresh_token;
    const expiresIn = payload.expires_in;
    const scope = payload.scope;
    if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof expiresIn !== "number") {
      throw new Error("WHOOP_TOKEN_INVALID");
    }
    return {
      accessToken,
      refreshToken,
      expiresIn,
      scopes: typeof scope === "string" ? scope.split(" ").filter(Boolean) : this.config.scopes,
    };
  }

  private async getJson(url: string, accessToken: string): Promise<unknown> {
    const response = await this.fetcher(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`WHOOP_API_${response.status}`);
    return response.json();
  }

  private toRecord(userId: string, recordType: RecordType, value: unknown): WhoopRecord {
    if (!isObject(value)) throw new Error("WHOOP_RECORD_INVALID");
    const sourceId = String(
      value.id ?? (recordType === "recovery" ? value.sleep_id : undefined) ?? `${recordType}-${value.user_id ?? "self"}`,
    );
    const occurredAtRaw = stringValue(value.start, stringValue(value.created_at, new Date().toISOString()));
    const updatedAtRaw = stringValue(value.updated_at, occurredAtRaw);
    return {
      userId,
      recordType,
      sourceId,
      occurredAt: new Date(occurredAtRaw),
      sourceUpdatedAt: new Date(updatedAtRaw),
      payload: Object.freeze({ ...value }),
      deletedAt: null,
      version: 0,
    };
  }
}
