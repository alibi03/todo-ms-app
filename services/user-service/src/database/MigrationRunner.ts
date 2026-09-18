import { resolve } from "node:path";
import { runner } from "node-pg-migrate";
import type { PoolClient } from "pg";

export class MigrationRunner {
  constructor(
    private readonly directory: string = resolve(__dirname, "../../migrations"),
    private readonly schema: string = "public"
  ) {}

  async run(client: PoolClient): Promise<string[]> {
    const applied = await runner({
      dbClient: client,
      dir: this.directory,
      schema: this.schema,
      migrationsTable: "pgmigrations",
      direction: "up",
      checkOrder: true,
      singleTransaction: true,
      advisoryLockMode: "fail",
      log: () => undefined,
    });

    return applied.map((migration) => migration.name);
  }
}
