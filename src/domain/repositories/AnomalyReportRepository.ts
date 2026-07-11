import { AnomalyReport } from "../models/AnomalyReport.js";

export interface AnomalyReportRepository {
  save(report: AnomalyReport): Promise<AnomalyReport>;
  findById(id: string): Promise<AnomalyReport | null>;
  findByEventId(eventId: string): Promise<AnomalyReport | null>;
  findLatest(limit: number): Promise<AnomalyReport[]>;
  getStats(): Promise<{ totalEvents: number; flaggedEvents: number; avgLatencyMs: number }>;
}
