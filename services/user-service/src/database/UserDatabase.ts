import { Pool, type QueryResult, type QueryResultRow } from "pg";

import type { DatabaseConfig } from "../config/environment";
import MigrationRunner from "./MigrationRunner";

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
      await new MigrationRunner().run(client);
    } finally {
      client.release();
    }
  }

  async query<T extends QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async checkHealth(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default UserDatabase;
