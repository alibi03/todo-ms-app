-- Up Migration
DO $migration$
BEGIN
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Existing installations already recorded this schema in the original tracker.
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE name = '001_initial_user_schema') THEN
    IF to_regclass('users') IS NULL OR to_regclass('password_reset_codes') IS NULL THEN
      RAISE EXCEPTION 'Recorded initial migration is missing its tables';
    END IF;
    RETURN;
  END IF;

  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
      CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE password_reset_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX password_reset_codes_user_id_index
    ON password_reset_codes(user_id);

  INSERT INTO schema_migrations (name) VALUES ('001_initial_user_schema');
END;
$migration$;
