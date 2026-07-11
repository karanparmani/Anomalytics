import { DatabaseSync } from "node:sqlite";
import { TrafficEventRepository } from "../../domain/repositories/TrafficEventRepository.js";
import { TrafficEvent, TrafficEventProps } from "../../domain/models/TrafficEvent.js";

export class TrafficEventRepositoryImpl implements TrafficEventRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async findById(id: string): Promise<TrafficEvent | null> {
    try {
      const stmt = this.db.prepare("SELECT * FROM traffic_events WHERE id = ?");
      const row = stmt.get(id) as Record<string, unknown> | undefined;

      if (!row) return null;

      return new TrafficEvent({
        id: row.id as string,
        timestamp: row.timestamp as string,
        source: row.source as "API" | "FlatFile" | "DbCommit" | "UserInput",
        payloadType: row.payload_type as "JSON" | "text" | "sql",
        payload: row.payload as string,
        actorId: row.actor_id as string,
        ipAddress: (row.ip_address as string) || null,
        location: (row.location as string) || null,
        amount: row.amount !== null ? (row.amount as number) : null,
        currency: (row.currency as string) || null,
        recipientName: (row.recipient_name as string) || null,
        recipientCountry: (row.recipient_country as string) || null,
        version: row.version as number
      });
    } catch (error) {
      console.error("[REPOSITORY ERROR] Failed to fetch traffic event by ID:", error);
      throw error;
    }
  }

  /**
   * Save handles both INSERT and UPDATE with Optimistic Concurrency Control (OCC)
   */
  public async save(event: TrafficEvent): Promise<TrafficEvent> {
    const existing = await this.findById(event.props.id);

    if (!existing) {
      // Insert new event
      try {
        const stmt = this.db.prepare(`
          INSERT INTO traffic_events (
            id, timestamp, source, payload_type, payload, actor_id, 
            ip_address, location, amount, currency, recipient_name, recipient_country, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        stmt.run(
          event.props.id,
          event.props.timestamp,
          event.props.source,
          event.props.payloadType,
          event.props.payload,
          event.props.actorId,
          event.props.ipAddress,
          event.props.location,
          event.props.amount,
          event.props.currency,
          event.props.recipientName,
          event.props.recipientCountry
        );

        return event.withProps({ version: 1 });
      } catch (error) {
        console.error("[REPOSITORY ERROR] Failed to insert traffic event:", error);
        throw error;
      }
    } else {
      // Update with Optimistic Concurrency Control (OCC)
      const currentVersion = event.props.version;
      const nextVersion = currentVersion + 1;

      try {
        const stmt = this.db.prepare(`
          UPDATE traffic_events SET
            timestamp = ?, source = ?, payload_type = ?, payload = ?, actor_id = ?,
            ip_address = ?, location = ?, amount = ?, currency = ?, 
            recipient_name = ?, recipient_country = ?, version = ?
          WHERE id = ? AND version = ?
        `);

        const result = stmt.run(
          event.props.timestamp,
          event.props.source,
          event.props.payloadType,
          event.props.payload,
          event.props.actorId,
          event.props.ipAddress,
          event.props.location,
          event.props.amount,
          event.props.currency,
          event.props.recipientName,
          event.props.recipientCountry,
          nextVersion,
          event.props.id,
          currentVersion
        );

        // In node:sqlite, StatementSync.run() returns { changes, lastInsertRowid }
        // If changes is 0, it means the version didn't match (OCC conflict)
        if (result.changes === 0) {
          throw new Error(
            `OCC CONFLICT: TrafficEvent '${event.props.id}' version mismatch. Expected version ${currentVersion}.`
          );
        }

        return event.withProps({ version: nextVersion });
      } catch (error) {
        console.error("[REPOSITORY OCC ERROR] Failed to update traffic event:", error);
        throw error;
      }
    }
  }
}
