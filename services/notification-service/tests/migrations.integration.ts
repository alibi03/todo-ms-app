import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { runner } from "node-pg-migrate";
import { loadConfig } from "../src/config/environment";
import { MigrationRunner } from "../src/database/MigrationRunner";

test("notification listing migrations preserve saved events", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_notifications_test_[a-z0-9_]+$/);
  const pool = new Pool({ ...config.database, database: config.database.name, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  async function withSchema(check: (client: PoolClient, schema: string) => Promise<void>): Promise<void> {
    const schema = "notification_migration_test_" + randomBytes(6).toString("hex");
    const client = await pool.connect();
    let created = false;
    try {
      await client.query('CREATE SCHEMA "' + schema + '"'); created = true;
      await client.query('SET search_path TO "' + schema + '"');
      await check(client, schema);
    } finally {
      await client.query("ROLLBACK");
      if (created) await client.query('DROP SCHEMA "' + schema + '" CASCADE');
      client.release();
    }
  }
  async function initial(client: PoolClient, schema: string): Promise<void> {
    await runner({ dbClient: client, dir: resolve(__dirname, "../migrations"), schema, migrationsTable: "pgmigrations",
      direction: "up", count: 1, singleTransaction: true, checkOrder: true, log: () => undefined });
  }
  try {
    await context.test("an empty database starts IDs at one and migrations do not repeat", async () => {
      await withSchema(async (client, schema) => {
        const migrations = new MigrationRunner(undefined, schema);
        assert.deepEqual(await migrations.run(client), ["001_notifications", "002_notification_listing"]);
        assert.deepEqual(await migrations.run(client), []);
        const result = await client.query("INSERT INTO notifications (event_id, event_type, task_id, recipient_user_id, title, occurred_at) VALUES ($1, 'task.assigned', 1, 2, 'First', now()) RETURNING id", [randomUUID()]);
        assert.equal(result.rows[0].id, 1);
      });
    });
    await context.test("upgrade backfills receipt order without changing existing event fields or migration history", async () => {
      await withSchema(async (client, schema) => {
        await initial(client, schema);
        for (const day of [3, 1, 2]) await client.query(
          "INSERT INTO notifications (event_id, event_type, task_id, recipient_user_id, title, occurred_at, created_at) VALUES ($1, 'task.assigned', 1, 2, $2, '2026-09-01', $3)",
          [randomUUID(), "Day " + day, "2026-09-0" + day]);
        const fields = "event_id, event_type, task_id, recipient_user_id, title, occurred_at, created_at";
        const before = (await client.query("SELECT " + fields + " FROM notifications ORDER BY created_at, event_id")).rows;
        const history = (await client.query("SELECT * FROM pgmigrations")).rows;
        const migrations = new MigrationRunner(undefined, schema);
        assert.deepEqual(await migrations.run(client), ["002_notification_listing"]);
        assert.deepEqual((await client.query("SELECT " + fields + " FROM notifications ORDER BY id")).rows, before);
        assert.deepEqual((await client.query("SELECT * FROM pgmigrations WHERE name = '001_notifications'")).rows, history);
        assert.deepEqual((await client.query("SELECT id FROM notifications ORDER BY id")).rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
        const added = await client.query("INSERT INTO notifications (event_id, event_type, task_id, recipient_user_id, title, occurred_at) VALUES ($1, 'task.reassigned', 1, 3, 'Next', now()) RETURNING id", [randomUUID()]);
        assert.equal(added.rows[0].id, 4);
        assert.deepEqual(await migrations.run(client), []);
      });
    });
    await context.test("a failed upgrade rolls back the schema and leaves the previous migration intact", async () => {
      await withSchema(async (client, schema) => {
        await initial(client, schema);
        await client.query("CREATE INDEX notifications_recipient_id_index ON notifications (title)");
        const migrations = new MigrationRunner(undefined, schema);
        await assert.rejects(migrations.run(client));
        assert.equal((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'notifications' AND column_name = 'id'", [schema])).rowCount, 0);
        assert.deepEqual((await client.query("SELECT name FROM pgmigrations")).rows, [{ name: "001_notifications" }]);
        await client.query("DROP INDEX notifications_recipient_id_index");
        assert.deepEqual(await migrations.run(client), ["002_notification_listing"]);
      });
    });
  } finally { await pool.end(); }
});
