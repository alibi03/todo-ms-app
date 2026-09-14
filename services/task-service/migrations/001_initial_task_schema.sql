-- Up Migration
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL CHECK (char_length(btrim(title)) > 0),
  description VARCHAR(2000) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  owner_user_id INTEGER NOT NULL CHECK (owner_user_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX tasks_owner_id_index ON tasks (owner_user_id, id);
