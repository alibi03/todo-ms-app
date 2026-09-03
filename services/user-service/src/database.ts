import { Pool, type PoolClient } from "pg";

import type { DatabaseConfig } from "./config";

const initialUserSchemaMigration = "001_initial_user_schema";

class UserDatabase {
  private readonly pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      max: 10,
      connectionTimeoutMillis: 5_000,
    });
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.createMigrationTable(client);

      const applied = await client.query<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [initialUserSchemaMigration]
      );

      if (applied.rowCount === 0) {
        await this.createInitialSchema(client);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [initialUserSchemaMigration]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkHealth(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async createMigrationTable(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async createInitialSchema(client: PoolClient): Promise<void> {
    await client.query(`
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
    `);
  }
}

export default UserDatabase;
