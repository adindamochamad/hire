CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  work_summary TEXT,
  client_amount NUMERIC(10, 2),
  maya_amount NUMERIC(10, 2),
  studio_amount NUMERIC(10, 2),
  client_agreed_at TIMESTAMPTZ,
  maya_agreed_at TIMESTAMPTZ,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  paypal_payout_batch_id TEXT,
  paypal_payout_item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT money_splits CHECK (
    (client_amount IS NULL AND maya_amount IS NULL AND studio_amount IS NULL)
    OR (
      client_amount IS NOT NULL
      AND maya_amount IS NOT NULL
      AND studio_amount IS NOT NULL
      AND client_amount = maya_amount + studio_amount
    )
  )
);

CREATE TABLE IF NOT EXISTS paypal_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  job_id TEXT REFERENCES jobs (id),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE paypal_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_status TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agreement_evidence JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS draft_source TEXT;

ALTER TABLE jobs ALTER COLUMN client_amount DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN maya_amount DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN studio_amount DROP NOT NULL;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS money_splits;
ALTER TABLE jobs ADD CONSTRAINT money_splits CHECK (
  (client_amount IS NULL AND maya_amount IS NULL AND studio_amount IS NULL)
  OR (
    client_amount IS NOT NULL
    AND maya_amount IS NOT NULL
    AND studio_amount IS NOT NULL
    AND client_amount = maya_amount + studio_amount
  )
) NOT VALID;

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  validation TEXT NOT NULL CHECK (validation IN ('pass', 'citation_rejected', 'parser_fallback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_runs_job_id_created_at_idx
  ON ai_runs (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  party TEXT NOT NULL CHECK (party IN ('studio', 'maya', 'client')),
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_messages_job_id_created_at_idx
  ON job_messages (job_id, created_at);

CREATE TABLE IF NOT EXISTS agreement_revisions (
  job_id TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  work_summary TEXT,
  client_amount NUMERIC(10, 2),
  maya_amount NUMERIC(10, 2),
  studio_amount NUMERIC(10, 2),
  evidence JSONB,
  clarification_questions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, version)
);

INSERT INTO jobs (id, work_summary, client_amount, maya_amount, studio_amount)
VALUES
  ('hire-job-1', null, null, null, null),
  ('hire-job-5', null, null, null, null)
ON CONFLICT (id) DO NOTHING;
