CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject TEXT NOT NULL UNIQUE,
  whoop_user_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whoop_tokens (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS whoop_records (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('cycle', 'recovery', 'sleep', 'workout', 'body')),
  source_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, record_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_whoop_records_timeline
  ON whoop_records(user_id, record_type, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS webhook_events (
  trace_id UUID PRIMARY KEY,
  whoop_user_id BIGINT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  primary_sport TEXT NOT NULL DEFAULT 'general fitness',
  goals TEXT[] NOT NULL DEFAULT '{}',
  weekly_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  injury_constraints TEXT[] NOT NULL DEFAULT '{}',
  target_event_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 0
);
