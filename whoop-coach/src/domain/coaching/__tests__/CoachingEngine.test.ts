import { describe, expect, it } from "vitest";
import type { RecordType, WhoopRecord } from "../../models.js";
import { CoachingEngine } from "../CoachingEngine.js";

const record = (
  recordType: RecordType,
  date: string,
  payload: Readonly<Record<string, unknown>>,
  id = `${recordType}-${date}`,
): WhoopRecord => ({
  userId: "00000000-0000-4000-8000-000000000001",
  recordType,
  sourceId: id,
  occurredAt: new Date(`${date}T08:00:00.000Z`),
  sourceUpdatedAt: new Date(`${date}T09:00:00.000Z`),
  payload,
  deletedAt: null,
  version: 0,
});

describe("CoachingEngine", () => {
  it("classifies a strong recovery day as green", () => {
    const records: WhoopRecord[] = [];
    for (let index = 1; index <= 28; index += 1) {
      const date = `2026-06-${String(index).padStart(2, "0")}`;
      records.push(record("recovery", date, {
        score: { recovery_score: index === 28 ? 82 : 70, hrv_rmssd_milli: 62, resting_heart_rate: 48 },
      }));
      records.push(record("sleep", date, { score: { sleep_performance_percentage: 91 } }));
      records.push(record("cycle", date, { score: { strain: 11 } }));
    }

    const dashboard = new CoachingEngine().build(records, new Date("2026-06-28T12:00:00.000Z"));

    expect(dashboard.readiness).toBe("green");
    expect(dashboard.baselines.hrv28dMedian).toBe(62);
    expect(dashboard.insights[0]?.id).toBe("readiness-green");
  });

  it("downgrades readiness when HRV is suppressed and resting heart rate is elevated", () => {
    const records = [
      record("recovery", "2026-07-10", { score: { recovery_score: 60, hrv_rmssd_milli: 70, resting_heart_rate: 48 } }),
      record("recovery", "2026-07-11", { score: { recovery_score: 62, hrv_rmssd_milli: 70, resting_heart_rate: 48 } }),
      record("recovery", "2026-07-12", { score: { recovery_score: 55, hrv_rmssd_milli: 45, resting_heart_rate: 56 } }),
    ];

    const dashboard = new CoachingEngine().build(records);

    expect(dashboard.readiness).toBe("red");
    expect(dashboard.insights.map((insight) => insight.id)).toEqual(
      expect.arrayContaining(["hrv-suppressed", "rhr-elevated"]),
    );
  });

  it("ignores deleted records", () => {
    const deleted = { ...record("recovery", "2026-07-12", { score: { recovery_score: 99 } }), deletedAt: new Date() };
    const dashboard = new CoachingEngine().build([deleted]);
    expect(dashboard.today).toBeNull();
    expect(dashboard.readiness).toBe("unknown");
  });
});
