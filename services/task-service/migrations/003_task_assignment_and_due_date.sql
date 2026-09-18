-- Up Migration
ALTER TABLE tasks
  ADD COLUMN assigned_to_user_id INTEGER CHECK (assigned_to_user_id > 0),
  ADD COLUMN due_date DATE CHECK (due_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');

CREATE INDEX tasks_assignee_id_index ON tasks (assigned_to_user_id, id)
  WHERE assigned_to_user_id IS NOT NULL;
