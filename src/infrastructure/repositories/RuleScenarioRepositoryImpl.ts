import { DatabaseSync } from "node:sqlite";
import { RuleScenarioRepository } from "../../domain/repositories/RuleScenarioRepository.js";
import { RuleScenario } from "../../domain/models/RuleScenario.js";

export class RuleScenarioRepositoryImpl implements RuleScenarioRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async findById(id: string): Promise<RuleScenario | null> {
    try {
      const stmt = this.db.prepare("SELECT * FROM rule_scenarios WHERE id = ?");
      const row = stmt.get(id) as Record<string, unknown> | undefined;

      if (!row) return null;

      return new RuleScenario({
        id: row.id as string,
        name: row.name as string,
        pattern: row.pattern as string,
        tactic: row.tactic as string,
        status: row.status as "ACTIVE" | "INACTIVE",
        version: row.version as number
      });
    } catch (error) {
      console.error("[REPOSITORY ERROR] Failed to find rule scenario by ID:", error);
      throw error;
    }
  }

  public async findAllActive(): Promise<RuleScenario[]> {
    try {
      const stmt = this.db.prepare("SELECT * FROM rule_scenarios WHERE status = 'ACTIVE'");
      const rows = stmt.all() as Record<string, unknown>[];

      return rows.map(
        row =>
          new RuleScenario({
            id: row.id as string,
            name: row.name as string,
            pattern: row.pattern as string,
            tactic: row.tactic as string,
            status: row.status as "ACTIVE" | "INACTIVE",
            version: row.version as number
          })
      );
    } catch (error) {
      console.error("[REPOSITORY ERROR] Failed to fetch active rules:", error);
      throw error;
    }
  }

  public async save(rule: RuleScenario): Promise<RuleScenario> {
    const existing = await this.findById(rule.props.id);

    if (!existing) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO rule_scenarios (id, name, pattern, tactic, status, version)
          VALUES (?, ?, ?, ?, ?, 1)
        `);

        stmt.run(
          rule.props.id,
          rule.props.name,
          rule.props.pattern,
          rule.props.tactic,
          rule.props.status
        );

        return rule.withProps({ version: 1 });
      } catch (error) {
        console.error("[REPOSITORY ERROR] Failed to insert rule scenario:", error);
        throw error;
      }
    } else {
      const currentVersion = rule.props.version;
      const nextVersion = currentVersion + 1;

      try {
        const stmt = this.db.prepare(`
          UPDATE rule_scenarios SET
            name = ?, pattern = ?, tactic = ?, status = ?, version = ?
          WHERE id = ? AND version = ?
        `);

        const result = stmt.run(
          rule.props.name,
          rule.props.pattern,
          rule.props.tactic,
          rule.props.status,
          nextVersion,
          rule.props.id,
          currentVersion
        );

        if (result.changes === 0) {
          throw new Error(
            `OCC CONFLICT: RuleScenario '${rule.props.id}' version mismatch. Expected version ${currentVersion}.`
          );
        }

        return rule.withProps({ version: nextVersion });
      } catch (error) {
        console.error("[REPOSITORY OCC ERROR] Failed to update rule scenario:", error);
        throw error;
      }
    }
  }
}
