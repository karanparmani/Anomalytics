import { DatabaseSync } from "node:sqlite";
import { AnomalyReportRepository } from "../../domain/repositories/AnomalyReportRepository.js";
import { AnomalyReport } from "../../domain/models/AnomalyReport.js";

export class AnomalyReportRepositoryImpl implements AnomalyReportRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async findById(id: string): Promise<AnomalyReport | null> {
    try {
      const stmt = this.db.prepare("SELECT * FROM anomaly_reports WHERE id = ?");
      const row = stmt.get(id) as Record<string, unknown> | undefined;
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      console.error("[REPOSITORY ERROR] Failed to find anomaly report by ID:", error);
      throw error;
    }
  }

  public async findByEventId(eventId: string): Promise<AnomalyReport | null> {
    try {
      const stmt = this.db.prepare("SELECT * FROM anomaly_reports WHERE event_id = ?");
      const row = stmt.get(eventId) as Record<string, unknown> | undefined;
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      console.error("[REPOSITORY ERROR] Failed to find anomaly report by event ID:", error);
      throw error;
    }
  }

  public async save(report: AnomalyReport): Promise<AnomalyReport> {
    const existing = await this.findById(report.props.id);

    if (!existing) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO anomaly_reports (
            id, event_id, score, detected_anomalies, mitre_atlas_tactics, 
            sanction_status, action_taken, timestamp, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        stmt.run(
          report.props.id,
          report.props.eventId,
          report.props.score,
          JSON.stringify(report.props.detectedAnomalies),
          JSON.stringify(report.props.mitreAtlasTactics),
          report.props.sanctionStatus,
          report.props.actionTaken,
          report.props.timestamp
        );

        return report.withProps({ version: 1 });
      } catch (error) {
        console.error("[REPOSITORY ERROR] Failed to insert anomaly report:", error);
        throw error;
      }
    } else {
      const currentVersion = report.props.version;
      const nextVersion = currentVersion + 1;

      try {
        const stmt = this.db.prepare(`
          UPDATE anomaly_reports SET
            event_id = ?, score = ?, detected_anomalies = ?, mitre_atlas_tactics = ?,
            sanction_status = ?, action_taken = ?, timestamp = ?, version = ?
          WHERE id = ? AND version = ?
        `);

        const result = stmt.run(
          report.props.eventId,
          report.props.score,
          JSON.stringify(report.props.detectedAnomalies),
          JSON.stringify(report.props.mitreAtlasTactics),
          report.props.sanctionStatus,
          report.props.actionTaken,
          report.props.timestamp,
          nextVersion,
          report.props.id,
          currentVersion
        );

        if (result.changes === 0) {
          throw new Error(
            `OCC CONFLICT: AnomalyReport '${report.props.id}' version mismatch. Expected version ${currentVersion}.`
          );
        }

        return report.withProps({ version: nextVersion });
      } catch (error) {
        console.error("[REPOSITORY OCC ERROR] Failed to update anomaly report:", error);
        throw error;
      }
    }
  }

  private mapRowToEntity(row: Record<string, unknown>): AnomalyReport {
    return new AnomalyReport({
      id: row.id as string,
      eventId: row.event_id as string,
      score: row.score as number,
      detectedAnomalies: JSON.parse(row.detected_anomalies as string) as string[],
      mitreAtlasTactics: JSON.parse(row.mitre_atlas_tactics as string) as string[],
      sanctionStatus: row.sanction_status as "PASSED" | "FLAGGED",
      actionTaken: row.action_taken as "ALLOWED" | "ESCALATE_TO_SOC" | "BLOCKED",
      timestamp: row.timestamp as string,
      version: row.version as number
    });
  }
}
