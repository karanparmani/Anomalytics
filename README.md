# Anomalytics

Anomalytics is an open-source, high-performance, AI-powered **User Behaviour Analytics (UEBA)** engine designed for financial services handling assets at scale. The tool ingests incoming traffic across various endpoints (APIs, flat files, database commits, user inputs), analyzes anomalous behaviors to detect bad actors, maps threats to **MITRE ATLAS** tactics, and validates against **OFAC sanctions** and **AML compliance guidelines**.

Optimized for high-throughput enterprise infrastructure, Anomalytics maintains a strict sub-millisecond execution hot path using native Node.js storage, routing dynamic AI updates out-of-band.

---

## Key Features

- **Multi-Channel Ingestion**: Seamless validation of API requests, flat-file bulk reports, database transaction commits, and natural language user inputs.
- **OFAC Sanctions & AML Validation**: Cache-backed name lookups supporting order-independent fuzzy overlaps, country compliance checks, and transaction threshold alerts.
- **MITRE ATLAS Threat Mapping**: Native rules flagging LLM jailbreaks, SQL injections, denial of service, and data exfiltration patterns.
- **Dynamic AI-Powered Scenario Updates**: Flagged threats trigger background AI routines to dynamically generate and seed adaptive regex rules without degrading transaction latency.
- **Visual Telemetry Dashboard**: A dark-themed, glassmorphic UI displaying real-time scanned events, blocked transactions, threat lists, and execution latency.
- **Zero-Dependency Database Driver**: Implemented using Node's native `node:sqlite` module, eliminating native C++ compilation issues and reducing software supply chain risks.

---

## System Architecture

Anomalytics is built following the **Clean Architecture / Layered Architecture** design patterns:

```
src/
├── domain/                  # Pure Core Business Logic (Zero external dependencies)
│   ├── models/              # Immutable Entities (TrafficEvent, AnomalyReport, RuleScenario)
│   ├── repositories/        # Repository Interfaces
│   └── services/            # AnomalyDetector, SanctionsChecker, RuleEngine
├── infrastructure/          # Frameworks, Database, and Adapters
│   ├── db/                  # Native SQLite Database connection (WAL mode configured)
│   ├── repositories/        # SQLite implementations with Optimistic Concurrency Control (OCC)
│   ├── ai/                  # Adaptive AI / Heuristic Rule Generators
│   ├── logging/             # MaskedString PII Privacy Protection utilities
│   └── web/                 # Express Server, Auth middlewares, Controllers, Static UI Assets
└── shared/                  # Common resources
    └── validation/          # Zod payload validation schemas & sanitizers
```

---

## Getting Started

### Prerequisites
- **Node.js**: `v22.5.0` or higher (utilizes native `node:sqlite`).
- **NPM**: `v10` or higher.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/karanparmani/Anomalytics.git
   cd Anomalytics
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
1. Copy the environment template and set your configurations:
   ```bash
   cp .env.example .env
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the interactive dashboard.

### Verification & Testing
- Run the Vitest unit/integration test suite:
  ```bash
  npm run test
  ```
- Run the traffic ingestion simulation script:
  ```bash
  npm run simulate
  ```

---

## Deployment on Render

This project is pre-configured for containerized deployment on Render. It includes:
- **`render.yaml`**: Blueprint template for single-click infrastructure setup.
- **`Dockerfile`**: Secure Alpine-based Node container running compilation and dependency pruning.

To deploy:
1. Log into your **[Render Dashboard](https://dashboard.render.com/)**.
2. Select **New** -> **Blueprint**.
3. Connect this repository and deploy.
