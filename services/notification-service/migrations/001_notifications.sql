-- Up Migration
CREATE TABLE notifications (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('task.assigned', 'task.reassigned')),
  task_id INTEGER NOT NULL CHECK (task_id > 0),
  recipient_user_id INTEGER NOT NULL CHECK (recipient_user_id > 0),
  title VARCHAR(200) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_index ON notifications (recipient_user_id, created_at, event_id);
