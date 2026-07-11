import { RuleScenario } from "../models/RuleScenario.js";

export interface RuleScenarioRepository {
  save(rule: RuleScenario): Promise<RuleScenario>;
  findAllActive(): Promise<RuleScenario[]>;
  findById(id: string): Promise<RuleScenario | null>;
}
