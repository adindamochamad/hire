CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  work_summary TEXT,
  client_amount NUMERIC(10, 2) NOT NULL,
  maya_amount NUMERIC(10, 2) NOT NULL,
  studio_amount NUMERIC(10, 2) NOT NULL,
  client_agreed_at TIMESTAMPTZ,
  maya_agreed_at TIMESTAMPTZ,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  paypal_payout_batch_id TEXT,
  paypal_payout_item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT money_splits CHECK (client_amount = maya_amount + studio_amount)
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

INSERT INTO jobs (id, work_summary, client_amount, maya_amount, studio_amount)
VALUES
  (
    'hire-job-1',
    'Landing page, two rounds of revision',
    1200.00,
    800.00,
    400.00
  ),
  (
    'hire-job-5',
    'Landing page, two rounds of revision',
    1200.00,
    800.00,
    400.00
  )
ON CONFLICT (id) DO NOTHING;
