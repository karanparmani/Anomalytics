import type {
  CoachingDashboard,
  CoachingInsight,
  CoachProfile,
  DailyMetric,
  ReadinessBand,
  WhoopRecord,
} from "../models.js";

const numberAt = (value: unknown, path: readonly string[]): number | null => {
  let cursor: unknown = value;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null || !(key in cursor)) return null;
    cursor = (cursor as Readonly<Record<string, unknown>>)[key];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
};

const localDate = (date: Date): string => date.toISOString().slice(0, 10);

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return null;
  if (sorted.length % 2 === 1) return right;
  const left = sorted[middle - 1];
  return left === undefined ? right : (left + right) / 2;
};

const average = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;

const round = (value: number | null, digits = 1): number | null =>
  value === null ? null : Number(value.toFixed(digits));

const chooseLatest = (current: WhoopRecord | undefined, candidate: WhoopRecord): WhoopRecord =>
  current === undefined || candidate.sourceUpdatedAt > current.sourceUpdatedAt ? candidate : current;

const metricFromRecords = (date: string, records: readonly WhoopRecord[]): DailyMetric => {
  const latestByType = new Map<string, WhoopRecord>();
  let workoutStrain = 0;

  for (const record of records) {
    if (record.recordType === "workout") {
      workoutStrain += numberAt(record.payload, ["score", "strain"]) ?? 0;
      continue;
    }
    latestByType.set(record.recordType, chooseLatest(latestByType.get(record.recordType), record));
  }

  const recovery = latestByType.get("recovery")?.payload;
  const sleep = latestByType.get("sleep")?.payload;
  const cycle = latestByType.get("cycle")?.payload;

  return {
    date,
    recoveryScore: numberAt(recovery, ["score", "recovery_score"]),
    hrvMs: round(numberAt(recovery, ["score", "hrv_rmssd_milli"])),
    restingHeartRate: round(numberAt(recovery, ["score", "resting_heart_rate"])),
    sleepPerformance: round(numberAt(sleep, ["score", "sleep_performance_percentage"])),
    dayStrain: round(numberAt(cycle, ["score", "strain"])),
    workoutStrain: Number(workoutStrain.toFixed(1)),
  };
};

const readinessBand = (today: DailyMetric | null, hrvBaseline: number | null, rhrBaseline: number | null): ReadinessBand => {
  if (today?.recoveryScore === null || today === null) return "unknown";
  let band: ReadinessBand = today.recoveryScore >= 67 ? "green" : today.recoveryScore >= 34 ? "yellow" : "red";
  const hrvSuppressed = today.hrvMs !== null && hrvBaseline !== null && today.hrvMs < hrvBaseline * 0.85;
  const rhrElevated = today.restingHeartRate !== null && rhrBaseline !== null && today.restingHeartRate > rhrBaseline * 1.08;
  if (band === "green" && (hrvSuppressed || rhrElevated)) band = "yellow";
  if (band === "yellow" && hrvSuppressed && rhrElevated) band = "red";
  return band;
};

const buildInsights = (
  today: DailyMetric | null,
  readiness: ReadinessBand,
  baselines: CoachingDashboard["baselines"],
  profile: CoachProfile | null,
): readonly CoachingInsight[] => {
  if (today === null) {
    return [{
      id: "waiting-for-data",
      category: "readiness",
      severity: "neutral",
      title: "Waiting for a scored WHOOP day",
      detail: "The connection is active, but there is not enough scored recovery data yet.",
      action: "Wear WHOOP through your next sleep and refresh again after recovery is scored.",
    }];
  }

  const insights: CoachingInsight[] = [];
  const readinessCopy: Record<Exclude<ReadinessBand, "unknown">, CoachingInsight> = {
    green: {
      id: "readiness-green",
      category: "readiness",
      severity: "positive",
      title: "Good capacity for quality work",
      detail: "Recovery and recent physiology support a normal or challenging session.",
      action: "Keep the planned key session, while using normal warm-up checks before adding volume.",
    },
    yellow: {
      id: "readiness-yellow",
      category: "readiness",
      severity: "neutral",
      title: "Train, but keep optional intensity optional",
      detail: "Recovery is workable, although at least one signal is below your recent baseline.",
      action: "Favor technique, aerobic work, or reduced volume; stop escalating if the warm-up feels unusually hard.",
    },
    red: {
      id: "readiness-red",
      category: "readiness",
      severity: "caution",
      title: "Recovery-first day",
      detail: "Current recovery and physiological signals do not support forcing a high-load session.",
      action: "Choose rest or easy movement and reassess tomorrow; persistent symptoms warrant professional advice.",
    },
  };
  if (readiness !== "unknown") insights.push(readinessCopy[readiness]);

  if (today.sleepPerformance !== null && today.sleepPerformance < 80) {
    insights.push({
      id: "sleep-opportunity",
      category: "sleep",
      severity: "caution",
      title: "Sleep is the clearest recovery opportunity",
      detail: `Sleep performance was ${today.sleepPerformance}%, below the 80% coaching threshold.`,
      action: "Protect a consistent wind-down and create at least 30–60 minutes more sleep opportunity tonight.",
    });
  }

  if (today.hrvMs !== null && baselines.hrv28dMedian !== null && today.hrvMs < baselines.hrv28dMedian * 0.85) {
    insights.push({
      id: "hrv-suppressed",
      category: "trend",
      severity: "caution",
      title: "HRV is meaningfully below baseline",
      detail: `Today's HRV is ${today.hrvMs} ms versus a 28-day median of ${baselines.hrv28dMedian} ms.`,
      action: "Avoid stacking another maximal day; review sleep, illness symptoms, travel, alcohol, and accumulated load.",
    });
  }

  if (today.restingHeartRate !== null && baselines.restingHeartRate28dMedian !== null && today.restingHeartRate > baselines.restingHeartRate28dMedian * 1.08) {
    insights.push({
      id: "rhr-elevated",
      category: "safety",
      severity: "caution",
      title: "Resting heart rate is elevated",
      detail: `Today's resting heart rate is ${today.restingHeartRate} bpm versus a 28-day median of ${baselines.restingHeartRate28dMedian} bpm.`,
      action: "Keep intensity conservative, especially if you also feel unwell or unusually fatigued.",
    });
  }

  const primaryGoal = profile?.goals[0];
  if (profile !== null && primaryGoal !== undefined) {
    insights.push({
      id: "goal-alignment",
      category: "training",
      severity: "neutral",
      title: `Keep the day aligned with ${profile.primarySport}`,
      detail: `Your current priority is: ${primaryGoal}`,
      action: "Use today's readiness to adjust the dose, while keeping the session's purpose tied to that goal.",
    });
  }

  return insights;
};

export class CoachingEngine {
  public build(records: readonly WhoopRecord[], now = new Date(), profile: CoachProfile | null = null): CoachingDashboard {
    const active = records.filter((record) => record.deletedAt === null);
    const grouped = new Map<string, WhoopRecord[]>();
    for (const record of active) {
      const date = localDate(record.occurredAt);
      grouped.set(date, [...(grouped.get(date) ?? []), record]);
    }

    const history = [...grouped.entries()]
      .map(([date, dayRecords]) => metricFromRecords(date, dayRecords))
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-90);
    const today = [...history].reverse().find((metric) => metric.recoveryScore !== null) ?? null;
    const baselineWindow = history.slice(-28);
    const sleepWindow = history.slice(-14);
    const strainWindow = history.slice(-7);
    const baselines = {
      hrv28dMedian: round(median(baselineWindow.flatMap((metric) => metric.hrvMs === null ? [] : [metric.hrvMs]))),
      restingHeartRate28dMedian: round(median(baselineWindow.flatMap((metric) => metric.restingHeartRate === null ? [] : [metric.restingHeartRate]))),
      sleepPerformance14dAverage: round(average(sleepWindow.flatMap((metric) => metric.sleepPerformance === null ? [] : [metric.sleepPerformance]))),
      strain7dAverage: round(average(strainWindow.flatMap((metric) => metric.dayStrain === null ? [] : [metric.dayStrain]))),
    };
    const readiness = readinessBand(today, baselines.hrv28dMedian, baselines.restingHeartRate28dMedian);
    const headline = readiness === "green"
      ? "Ready for purposeful training"
      : readiness === "yellow"
        ? "Train with a flexible ceiling"
        : readiness === "red"
          ? "Make recovery the training goal"
          : "More WHOOP data is needed";

    return {
      generatedAt: now.toISOString(),
      readiness,
      headline,
      today,
      baselines,
      history,
      insights: buildInsights(today, readiness, baselines, profile),
      profile,
      disclaimer: "Training guidance only. This app does not diagnose illness or replace medical care.",
    };
  }
}
