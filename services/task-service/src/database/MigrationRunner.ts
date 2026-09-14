import { resolve } from "node:path";
import type { PoolClient } from "pg";

class MigrationRunner {
  constructor(
    private readonly directory: string = resolve(__dirname, "../../migrations"),
    private readonly schema: string = "public"
  ) {}

  async run(client: PoolClient): Promise<string[]> {
    const { runner } = await import("node-pg-migrate");
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

export default MigrationRunner;
