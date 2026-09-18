import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../src/config/environment";
import { MigrationRunner } from "../src/database/MigrationRunner";

test("assignment migration preserves existing task data", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_tasks_test_[a-z0-9_]+$/);
  const pool = new Pool({ ...config.database, database: config.database.name });
  const schema = "assignment_test_" + randomBytes(6).toString("hex");
  const directory = await mkdtemp(resolve(tmpdir(), "task-assignment-test-"));
  const client = await pool.connect();
  let created = false;
  try {
    await client.query('CREATE SCHEMA "' + schema + '"');
    created = true;
    await client.query('SET search_path TO "' + schema + '"');
    for (const file of ["001_initial_task_schema.sql", "002_task_statuses.sql"]) {
      await copyFile(resolve(__dirname, "../migrations", file), resolve(directory, file));
    }
    const runner = new MigrationRunner(directory, schema);
    await runner.run(client);
    await client.query("INSERT INTO tasks (title, owner_user_id, status) VALUES ('Existing', 1, 'completed')");
    const before = (await client.query("SELECT * FROM tasks")).rows[0];
    await copyFile(resolve(__dirname, "../migrations/003_task_assignment_and_due_date.sql"), resolve(directory, "003_task_assignment_and_due_date.sql"));
    await context.test("failed batches roll back the new columns and migration record", async () => {
      const broken = resolve(directory, "004_failure.sql");
      await writeFile(broken, "-- Up Migration\nSELECT * FROM missing_assignment_test_table;\n");
      try {
        await assert.rejects(runner.run(client));
        assert.deepEqual((await client.query("SELECT * FROM tasks")).rows[0], before);
        await assert.rejects(client.query("SELECT assigned_to_user_id FROM tasks"));
        assert.equal((await client.query("SELECT count(*)::int AS count FROM pgmigrations")).rows[0].count, 2);
      } finally { await rm(broken); }
    });
    await context.test("upgrade initializes nullable fields without changing existing columns", async () => {
      assert.deepEqual(await runner.run(client), ["003_task_assignment_and_due_date"]);
      assert.deepEqual((await client.query("SELECT * FROM tasks")).rows[0], { ...before, assigned_to_user_id: null, due_date: null });
      assert.deepEqual(await runner.run(client), []);
      const result = await client.query("INSERT INTO tasks (title, owner_user_id) VALUES ('Next', 1) RETURNING id, assigned_to_user_id, due_date");
      assert.deepEqual(result.rows[0], { id: 2, assigned_to_user_id: null, due_date: null });
    });
    await context.test("database rejects invalid assignees and dates independently of DTOs", async () => {
      for (const id of [0, -1]) await assert.rejects(client.query("UPDATE tasks SET assigned_to_user_id = $1", [id]));
      for (const date of ["2026-02-29", "2026-04-31", "infinity", "-infinity", "10000-01-01", "0001-01-01 BC"]) {
        await assert.rejects(client.query("UPDATE tasks SET due_date = $1", [date]));
      }
      await client.query("UPDATE tasks SET assigned_to_user_id = 2, due_date = '2028-02-29'");
      assert.equal((await client.query("SELECT to_char(due_date, 'YYYY-MM-DD') AS date FROM tasks LIMIT 1")).rows[0].date, "2028-02-29");
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
