-- Up Migration
ALTER TABLE notifications ADD COLUMN id INTEGER;

-- Preserve receipt order when assigning IDs to notifications saved before this migration.
WITH numbered AS (
  SELECT event_id, row_number() OVER (ORDER BY created_at, event_id) AS id FROM notifications
)
UPDATE notifications SET id = numbered.id::integer FROM numbered WHERE notifications.event_id = numbered.event_id;

ALTER TABLE notifications ALTER COLUMN id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;
SELECT setval(pg_get_serial_sequence('notifications', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM notifications;
ALTER TABLE notifications ADD CONSTRAINT notifications_id_unique UNIQUE (id);
ALTER TABLE notifications ADD CONSTRAINT notifications_id_positive CHECK (id > 0);
CREATE INDEX notifications_recipient_id_index ON notifications (recipient_user_id, id);
