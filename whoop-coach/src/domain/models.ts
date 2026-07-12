export const recordTypes = ["cycle", "recovery", "sleep", "workout", "body"] as const;
export type RecordType = (typeof recordTypes)[number];

export interface AppUser {
  readonly id: string;
  readonly authSubject: string;
  readonly whoopUserId: number | null;
  readonly version: number;
}

export interface WhoopTokenSet {
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  readonly scopes: readonly string[];
  readonly version: number;
}

export interface WhoopRecord {
  readonly userId: string;
  readonly recordType: RecordType;
  readonly sourceId: string;
  readonly occurredAt: Date;
  readonly sourceUpdatedAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly deletedAt: Date | null;
  readonly version: number;
}

export interface CoachProfile {
  readonly userId: string;
  readonly primarySport: string;
  readonly goals: readonly string[];
  readonly weeklySchedule: Readonly<Record<string, unknown>>;
  readonly injuryConstraints: readonly string[];
  readonly targetEventDate: string | null;
  readonly version: number;
}

export type ReadinessBand = "green" | "yellow" | "red" | "unknown";

export interface CoachingInsight {
  readonly id: string;
  readonly category: "readiness" | "sleep" | "training" | "trend" | "safety";
  readonly severity: "positive" | "neutral" | "caution";
  readonly title: string;
  readonly detail: string;
  readonly action: string;
}

export interface DailyMetric {
  readonly date: string;
  readonly recoveryScore: number | null;
  readonly hrvMs: number | null;
  readonly restingHeartRate: number | null;
  readonly sleepPerformance: number | null;
  readonly dayStrain: number | null;
  readonly workoutStrain: number;
}

export interface CoachingDashboard {
  readonly generatedAt: string;
  readonly readiness: ReadinessBand;
  readonly headline: string;
  readonly today: DailyMetric | null;
  readonly baselines: {
    readonly hrv28dMedian: number | null;
    readonly restingHeartRate28dMedian: number | null;
    readonly sleepPerformance14dAverage: number | null;
    readonly strain7dAverage: number | null;
  };
  readonly history: readonly DailyMetric[];
  readonly insights: readonly CoachingInsight[];
  readonly profile: CoachProfile | null;
  readonly disclaimer: string;
}
