import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/AuthMiddleware.js";
import { TrafficEventSchema, sanitizeInput } from "../../../shared/validation/schemas.js";
import { TrafficEvent } from "../../../domain/models/TrafficEvent.js";
import { AnomalyDetector } from "../../../domain/services/AnomalyDetector.js";
import { TrafficEventRepository } from "../../../domain/repositories/TrafficEventRepository.js";
import { AnomalyReportRepository } from "../../../domain/repositories/AnomalyReportRepository.js";
import { RuleScenarioRepository } from "../../../domain/repositories/RuleScenarioRepository.js";
import { AiScenarioGenerator } from "../../ai/AiScenarioGenerator.js";

export class TrafficController {
  private readonly eventRepo: TrafficEventRepository;
  private readonly reportRepo: AnomalyReportRepository;
  private readonly ruleRepo: RuleScenarioRepository;
  private readonly detector: AnomalyDetector;
  private readonly aiGenerator: AiScenarioGenerator;

  constructor(
    eventRepo: TrafficEventRepository,
    reportRepo: AnomalyReportRepository,
    ruleRepo: RuleScenarioRepository,
    detector: AnomalyDetector,
    aiGenerator: AiScenarioGenerator
  ) {
    this.eventRepo = eventRepo;
    this.reportRepo = reportRepo;
    this.ruleRepo = ruleRepo;
    this.detector = detector;
    this.aiGenerator = aiGenerator;
  }

  /**
   * Main Traffic ingestion endpoint.
   * Runs synchronous checks (OFAC, dynamic rules) under 50ms.
   * Triggers AI learning asynchronously to protect SLAs.
   */
  public analyzeTraffic = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const startTime = performance.now();
    try {
      // 1. Validate Input payload using Zod Schema (Boundary Control)
      const parsedBody = TrafficEventSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({
          status: "INVALID_REQUEST",
          errors: parsedBody.error.errors.map(e => `${e.path.join(".")}: ${e.message}`)
        });
        return;
      }

      // 2. Sanitize payload data
      const sanitizedData = sanitizeInput(parsedBody.data);

      // Create unique event ID
      const eventId = `evt_${Math.random().toString(36).substring(7)}`;

      // 3. Construct domain TrafficEvent (Immutable, business layer)
      const trafficEvent = TrafficEvent.create({
        id: eventId,
        timestamp: new Date().toISOString(),
        source: sanitizedData.source,
        payloadType: sanitizedData.payloadType,
        payload: sanitizedData.payload,
        actorId: sanitizedData.actorId,
        ipAddress: sanitizedData.ipAddress || null,
        location: sanitizedData.location || null,
        amount: sanitizedData.amount !== undefined ? sanitizedData.amount : null,
        currency: sanitizedData.currency || null,
        recipientName: sanitizedData.recipientName || null,
        recipientCountry: sanitizedData.recipientCountry || null
      });

      // 4. Save Event to database (OCC handled in Repository)
      await this.eventRepo.save(trafficEvent);

      // 5. Fetch all Active Rule Scenarios
      const activeRules = await this.ruleRepo.findAllActive();

      // 6. Execute detection engine (Sync, O(1) sanctions + compiled regex matching)
      const report = this.detector.analyze(trafficEvent, activeRules);

      // 7. Save report to DB (OCC handled)
      await this.reportRepo.save(report);

      const endTime = performance.now();
      const executionMs = endTime - startTime;

      // 8. Dynamic learning: if flagged, trigger AI engine out-of-band (Asynchronously)
      if (report.props.actionTaken === "ESCALATE_TO_SOC" || report.props.actionTaken === "BLOCKED") {
        // Fire-and-forget in background to protect sub-50ms execution SLA
        this.aiGenerator.analyzeAndGenerateRule(trafficEvent, report).catch(err => {
          console.error("[BACKGROUND AI ERROR] Failed to generate dynamic rule scenario:", err);
        });
      }

      // 9. Return result indicating disposition and execution latency
      res.status(200).json({
        status: "SUCCESS",
        eventId: trafficEvent.props.id,
        disposition: report.props.actionTaken,
        score: report.props.score,
        anomalies: report.props.detectedAnomalies,
        mitreAtlasTactics: report.props.mitreAtlasTactics,
        latencyMs: executionMs
      });
    } catch (error) {
      console.error("[SERVER ERROR] Error processing traffic analysis request:", error);
      res.status(500).json({ error: "Internal compliance server error occurred" });
    }
  };

  /**
   * Fetch anomalies list for SOC.
   */
  public getAnomalyReportByEventId = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const eventId = req.params.eventId;
      if (!eventId) {
        res.status(400).json({ error: "Missing eventId parameter" });
        return;
      }

      const report = await this.reportRepo.findByEventId(eventId);
      if (!report) {
        res.status(404).json({ error: "Anomaly report not found for specified event" });
        return;
      }

      res.status(200).json(report.props);
    } catch (error) {
      console.error("[SERVER ERROR] Error fetching anomaly report:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
