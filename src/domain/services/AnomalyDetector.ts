import { TrafficEvent } from "../models/TrafficEvent.js";
import { AnomalyReport } from "../models/AnomalyReport.js";
import { RuleScenario } from "../models/RuleScenario.js";
import { SanctionsChecker } from "./SanctionsChecker.js";
import { RuleEngine } from "./RuleEngine.js";

export class AnomalyDetector {
  private readonly sanctionsChecker: SanctionsChecker;
  private readonly ruleEngine: RuleEngine;

  constructor(amlThreshold = 10000.0) {
    this.sanctionsChecker = new SanctionsChecker(amlThreshold);
    this.ruleEngine = new RuleEngine();
  }

  /**
   * Orchestrates the anomalous traffic evaluation.
   * Pure domain logic - zero database or external HTTP dependencies.
   */
  public analyze(
    event: TrafficEvent,
    activeRules: RuleScenario[]
  ): AnomalyReport {
    const start = Date.now();
    const detectedAnomalies: string[] = [];
    let mitreAtlasTactics: string[] = [];
    let sanctionStatus: "PASSED" | "FLAGGED" = "PASSED";
    let actionTaken: "ALLOWED" | "ESCALATE_TO_SOC" | "BLOCKED" = "ALLOWED";

    // 1. Check OFAC / AML Guidelines
    const sanctionsResult = this.sanctionsChecker.check(
      event.props.recipientName,
      event.props.recipientCountry,
      event.props.amount
    );

    if (sanctionsResult.isSanctioned) {
      sanctionStatus = "FLAGGED";
      detectedAnomalies.push(...sanctionsResult.reasons);
      actionTaken = "BLOCKED"; // Financial embargoes block transactions immediately
    }

    // 2. Evaluate Threat Scenarios (MITRE ATLAS alignment)
    const ruleEvaluation = this.ruleEngine.evaluate(event.props.payload, activeRules);
    if (ruleEvaluation.matches.length > 0) {
      detectedAnomalies.push(...ruleEvaluation.matches);
      mitreAtlasTactics.push(...ruleEvaluation.tactics);
      
      // If not already blocked by sanctions, escalate to SOC
      if (actionTaken !== "BLOCKED") {
        actionTaken = "ESCALATE_TO_SOC";
      }
    }

    // 3. Compute Anomaly Score
    let score = 0.0;
    if (sanctionStatus === "FLAGGED") {
      score = 1.0;
    } else if (ruleEvaluation.matches.length > 0) {
      // Score based on number of triggered rules
      score = Math.min(1.0, 0.4 + ruleEvaluation.matches.length * 0.2);
    }

    // Generate unique ID for the report based on the event ID
    const reportId = `rep_${event.props.id.replace("evt_", "").replace("sim_", "")}`;

    return AnomalyReport.create({
      id: reportId,
      eventId: event.props.id,
      score,
      detectedAnomalies,
      mitreAtlasTactics,
      sanctionStatus,
      actionTaken,
      timestamp: new Date().toISOString()
    });
  }
}
