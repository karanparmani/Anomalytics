-- Core schema for the UEBA Agentic Tool
-- Enforces data integrity and Optimistic Concurrency Control (OCC)

CREATE TABLE IF NOT EXISTS traffic_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL,          -- E.g., API, FlatFile, DbCommit, UserInput
    payload_type TEXT NOT NULL,    -- E.g., JSON, text, sql
    payload TEXT NOT NULL,         -- The raw payload
    actor_id TEXT NOT NULL,
    ip_address TEXT,
    location TEXT,
    amount REAL,                   -- Value for transaction-based traffic
    currency TEXT,
    recipient_name TEXT,
    recipient_country TEXT,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS anomaly_reports (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    score REAL NOT NULL,           -- Anomaly score between 0.0 and 1.0
    detected_anomalies TEXT NOT NULL, -- JSON array of detected anomaly reasons
    mitre_atlas_tactics TEXT NOT NULL, -- JSON array of mapped MITRE ATLAS tactics
    sanction_status TEXT NOT NULL, -- E.g., PASSED, FLAGGED
    action_taken TEXT NOT NULL,    -- E.g., ALLOWED, ESCALATE_TO_SOC, BLOCKED
    timestamp TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(event_id) REFERENCES traffic_events(id)
);

CREATE TABLE IF NOT EXISTS rule_scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,         -- Regex pattern to execute
    tactic TEXT NOT NULL,          -- Associated MITRE ATLAS tactic
    status TEXT NOT NULL,          -- E.g., ACTIVE, INACTIVE
    version INTEGER NOT NULL DEFAULT 1
);

-- Insert initial active rules for anomaly detection (MITRE ATLAS & Compliance guidelines)
INSERT OR IGNORE INTO rule_scenarios (id, name, pattern, tactic, status, version) VALUES
('rule_jailbreak', 'LLM Jailbreak Attempt', '(jailbreak|ignore previous instructions|system prompt|override security|dan mode)', 'AML.T0012: LLM Jailbreak/Injection', 'ACTIVE', 1),
('rule_sql_inject', 'SQL Injection Attempt', '(UNION SELECT|SELECT.*FROM|DROP TABLE|INSERT INTO|OR 1=1|--)', 'AML.T0006: Poison Training Data', 'ACTIVE', 1),
('rule_dos_flood', 'Denial of Service Payload', '(flood|ddos|ping -f|exhaust_resources)', 'AML.T0015: Denial of Service', 'ACTIVE', 1),
('rule_exfiltrate', 'Data Exfiltration Pattern', '(aws_access_key|private_key|ssh-rsa|secret_token|id_rsa)', 'AML.T0002: Exfiltration', 'ACTIVE', 1);
