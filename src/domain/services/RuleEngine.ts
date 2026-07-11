import { RuleScenario } from "../models/RuleScenario.js";

export class RuleEngine {
  /**
   * Evaluates incoming payload text against a set of active RuleScenarios.
   * Maps matching payloads to MITRE ATLAS tactics.
   */
  public evaluate(payload: string, activeRules: RuleScenario[]): { matches: string[]; tactics: string[] } {
    const matches: string[] = [];
    const tactics: string[] = [];

    // Safely evaluate rules
    for (const rule of activeRules) {
      try {
        // Compile regex safely
        const regex = new RegExp(rule.props.pattern, "i");
        
        // Execute regex check
        if (regex.test(payload)) {
          matches.push(`Rule Triggered: ${rule.props.name}`);
          tactics.push(rule.props.tactic);
        }
      } catch (error) {
        // Log compilation or execution issues safely
        console.error(`[SECURITY WARNING] Failed to evaluate pattern for rule ${rule.props.id}:`, error);
      }
    }

    return {
      matches,
      tactics: Array.from(new Set(tactics)) // Deduplicate tactics
    };
  }
}
