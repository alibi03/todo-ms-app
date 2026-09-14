import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../src/config/environment";
import MigrationRunner from "../src/database/MigrationRunner";

test("status migration upgrades an existing task database safely", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_tasks_test_[a-z0-9_]+$/);
  const pool = new Pool({ ...config.database, database: config.database.name });
  const schema = "status_test_" + randomBytes(6).toString("hex");
  const directory = await mkdtemp(resolve(tmpdir(), "task-status-test-"));
  const client = await pool.connect();
  let created = false;
  try {
    await client.query('CREATE SCHEMA "' + schema + '"');
    created = true;
    await client.query('SET search_path TO "' + schema + '"');
    await copyFile(resolve(__dirname, "../migrations/001_initial_task_schema.sql"), resolve(directory, "001_initial_task_schema.sql"));
    const runner = new MigrationRunner(directory, schema);
    await runner.run(client);
    await client.query("INSERT INTO tasks (title, description, owner_user_id) VALUES ('Existing task', 'Keep this', 1)");
    const before = (await client.query("SELECT * FROM tasks")).rows;
    await context.test("baseline rejects the new statuses before upgrade", async () => {
      await assert.rejects(client.query("UPDATE tasks SET status = 'completed'"));
    });
    await copyFile(resolve(__dirname, "../migrations/002_task_statuses.sql"), resolve(directory, "002_task_statuses.sql"));
    await context.test("a failed migration batch restores the original constraint and tracking", async () => {
      const broken = resolve(directory, "003_failure.sql");
      await writeFile(broken, "-- Up Migration\nSELECT * FROM missing_status_test_table;\n");
      try {
        await assert.rejects(runner.run(client));
        await assert.rejects(client.query("UPDATE tasks SET status = 'completed'"));
        assert.deepEqual((await client.query("SELECT name FROM pgmigrations ORDER BY id")).rows, [{ name: "001_initial_task_schema" }]);
        assert.deepEqual((await client.query("SELECT * FROM tasks")).rows, before);
      } finally {
        await rm(broken);
      }
    });
    await context.test("upgrade preserves existing rows and runs only the new migration", async () => {
      assert.deepEqual(await runner.run(client), ["002_task_statuses"]);
      assert.deepEqual((await client.query("SELECT * FROM tasks")).rows, before);
      assert.deepEqual(await runner.run(client), []);
    });
    await context.test("upgraded constraint allows supported statuses and rejects unknown values", async () => {
      for (const status of ["in_progress", "completed", "pending"]) {
        await client.query("UPDATE tasks SET status = $1", [status]);
        assert.equal((await client.query("SELECT status FROM tasks")).rows[0]?.status, status);
      }
      await assert.rejects(client.query("UPDATE tasks SET status = 'archived'"));
      const next = await client.query("INSERT INTO tasks (title, owner_user_id) VALUES ('Next task', 1) RETURNING id, status");
      assert.equal(next.rows[0]?.id, 2);
      assert.equal(next.rows[0]?.status, "pending");
    });
  } finally {
    try {
      await client.query("SET search_path TO public");
      if (created) await client.query('DROP SCHEMA "' + schema + '" CASCADE');
    } finally {
      client.release();
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
