-- Up Migration
CREATE TABLE task_outbox (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('task.assigned', 'task.reassigned')),
  task_id INTEGER NOT NULL CHECK (task_id > 0),
  recipient_user_id INTEGER NOT NULL CHECK (recipient_user_id > 0),
  title VARCHAR(200) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  published_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_id UUID,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX task_outbox_pending_index ON task_outbox (available_at, occurred_at)
  WHERE published_at IS NULL;
