import express from "express";
import dotenv from "dotenv";
import { Database } from "../db/Database.js";
import { TrafficEventRepositoryImpl } from "../repositories/TrafficEventRepositoryImpl.js";
import { AnomalyReportRepositoryImpl } from "../repositories/AnomalyReportRepositoryImpl.js";
import { RuleScenarioRepositoryImpl } from "../repositories/RuleScenarioRepositoryImpl.js";
import { AnomalyDetector } from "../../domain/services/AnomalyDetector.js";
import { AiScenarioGenerator } from "../ai/AiScenarioGenerator.js";
import { TrafficController } from "./controllers/TrafficController.js";
import { requireAuth, requireRole } from "./middleware/AuthMiddleware.js";

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Database connection
const db = Database.getInstance();

// Instantiate Repositories
const eventRepo = new TrafficEventRepositoryImpl(db);
const reportRepo = new AnomalyReportRepositoryImpl(db);
const ruleRepo = new RuleScenarioRepositoryImpl(db);

// Instantiate Services & Controller
const amlThreshold = parseFloat(process.env.AML_THRESHOLD_USD ?? "10000.00");
const detector = new AnomalyDetector(amlThreshold);
const aiGenerator = new AiScenarioGenerator(ruleRepo);
const controller = new TrafficController(eventRepo, reportRepo, ruleRepo, detector, aiGenerator);

// Enforce security policies and authentication checks on API handlers
app.post(
  "/api/traffic",
  requireAuth(),
  requireRole(["admin", "soc_analyst", "client_service"]),
  controller.analyzeTraffic
);

app.get(
  "/api/anomalies/:eventId",
  requireAuth(),
  requireRole(["admin", "soc_analyst"]),
  controller.getAnomalyReportByEventId
);

// COMPLIANCE: Public Route
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT ?? 3000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[UEBA SECURITY SERVER] Live and listening on port ${PORT} in ${process.env.NODE_ENV} mode.`);
  });
}

export { app };
