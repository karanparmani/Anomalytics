import type { RecordType, WhoopRecord } from "./models.js";

export interface WhoopOAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly scopes: readonly string[];
}

export interface WhoopGateway {
  buildAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<WhoopOAuthTokens>;
  refresh(refreshToken: string): Promise<WhoopOAuthTokens>;
  getProfile(accessToken: string): Promise<{ readonly userId: number }>;
  fetchCollection(
    accessToken: string,
    userId: string,
    recordType: RecordType,
    start: Date,
    end: Date,
  ): Promise<readonly WhoopRecord[]>;
  fetchById(
    accessToken: string,
    userId: string,
    recordType: "recovery" | "sleep" | "workout",
    sourceId: string,
  ): Promise<WhoopRecord>;
}
