import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { Pool, type PoolClient } from "pg";

import { loadConfig } from "../src/config/environment";
import MigrationRunner from "../src/database/MigrationRunner";

test("migrations preserve existing schemas and apply pending versions safely", async (t) => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_users_test_[a-z0-9_]+$/, "Use a dedicated staj_users_test_* database.");
  const pool = new Pool({ ...config.database, database: config.database.name });
  const initial = await readFile(resolve(__dirname, "../migrations/001_initial_user_schema.sql"), "utf8");

  async function withSchema(check: (client: PoolClient, schema: string) => Promise<void>): Promise<void> {
    const schema = "migration_test_" + randomBytes(6).toString("hex");
    const client = await pool.connect();
    let created = false;
    try {
      await client.query('CREATE SCHEMA "' + schema + '"');
      created = true;
      await client.query('SET search_path TO "' + schema + '"');
      await check(client, schema);
    } finally {
      try {
        await client.query("SET search_path TO public");
        if (created) await client.query('DROP SCHEMA "' + schema + '" CASCADE');
      } finally {
        client.release();
      }
    }
  }

  async function withFiles(check: (directory: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(resolve(tmpdir(), "user-migration-test-"));
    try {
      await writeFile(resolve(directory, "001_initial_user_schema.sql"), initial);
      await check(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  try {
    await t.test("a fresh schema is initialized once", async () => {
      await withSchema(async (client, schema) => {
        const runner = new MigrationRunner(undefined, schema);
        assert.deepEqual(await runner.run(client), ["001_initial_user_schema"]);
        assert.deepEqual(await runner.run(client), []);
        const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename", [schema]);
        assert.deepEqual(tables.rows.map(row => row.tablename), ["password_reset_codes", "pgmigrations", "schema_migrations", "users"]);
      });
    });

    await t.test("an existing migration record preserves users, hashes and reset codes", async () => {
      await withSchema(async (client, schema) => {
        // Execute the original schema without creating the new runner's tracking table.
        await client.query(initial);
        await client.query("INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)",
          ["existing_user", "existing@example.com", "test-only-hash", "admin"]);
        await client.query("INSERT INTO password_reset_codes (user_id, code_hash, expires_at) SELECT id, $1, NOW() + INTERVAL '1 hour' FROM users", ["test-only-code-hash"]);
        const beforeUsers = await client.query("SELECT * FROM users ORDER BY id");
        const beforeCodes = await client.query("SELECT * FROM password_reset_codes ORDER BY id");
        const beforeMigration = await client.query("SELECT * FROM schema_migrations");

        const runner = new MigrationRunner(undefined, schema);
        assert.deepEqual(await runner.run(client), ["001_initial_user_schema"]);
        assert.deepEqual(await runner.run(client), []);
        assert.deepEqual((await client.query("SELECT * FROM users ORDER BY id")).rows, beforeUsers.rows);
        assert.deepEqual((await client.query("SELECT * FROM password_reset_codes ORDER BY id")).rows, beforeCodes.rows);
        assert.deepEqual((await client.query("SELECT * FROM schema_migrations")).rows, beforeMigration.rows);
        const next = await client.query("INSERT INTO users (username, email, password_hash) VALUES ('next_user', 'next@example.com', 'test-only-hash') RETURNING id");
        assert.ok(next.rows[0].id > beforeUsers.rows[0].id);
      });
    });

    await t.test("all pending migrations run in order and are not repeated", async () => {
      await withSchema(async (client, schema) => {
        await withFiles(async directory => {
          const runner = new MigrationRunner(directory, schema);
          await runner.run(client);
          await writeFile(resolve(directory, "003_second_step.sql"), "-- Up Migration\nINSERT INTO migration_probe (step) VALUES (2);\n");
          await writeFile(resolve(directory, "002_first_step.sql"), "-- Up Migration\nCREATE TABLE migration_probe (step integer); INSERT INTO migration_probe (step) VALUES (1);\n");
          assert.deepEqual(await runner.run(client), ["002_first_step", "003_second_step"]);
          assert.deepEqual(await runner.run(client), []);
          assert.deepEqual((await client.query("SELECT step FROM migration_probe ORDER BY step")).rows, [{ step: 1 }, { step: 2 }]);
        });
      });
    });

    await t.test("failed pending migrations roll back changes and tracking records", async () => {
      await withSchema(async (client, schema) => {
        await withFiles(async directory => {
          const runner = new MigrationRunner(directory, schema);
          await runner.run(client);
          await writeFile(resolve(directory, "002_add_probe.sql"), "-- Up Migration\nCREATE TABLE migration_probe (id integer);\n");
          await writeFile(resolve(directory, "003_fail.sql"), "-- Up Migration\nSELECT missing_column FROM users;\n");
          await assert.rejects(runner.run(client));
          assert.equal((await client.query("SELECT to_regclass('migration_probe') AS name")).rows[0].name, null);
          assert.deepEqual((await client.query("SELECT name FROM pgmigrations ORDER BY id")).rows, [{ name: "001_initial_user_schema" }]);
          // The next attempt must be able to acquire the lock released after failure.
          await writeFile(resolve(directory, "003_fail.sql"), "-- Up Migration\nINSERT INTO migration_probe (id) VALUES (1);\n");
          assert.deepEqual(await runner.run(client), ["002_add_probe", "003_fail"]);
        });
      });
    });

    await t.test("a newly inserted older migration is rejected", async () => {
      await withSchema(async (client, schema) => {
        await withFiles(async directory => {
          const runner = new MigrationRunner(directory, schema);
          await runner.run(client);
          await writeFile(resolve(directory, "000_out_of_order.sql"), "-- Up Migration\nCREATE TABLE out_of_order (id integer);\n");
          await assert.rejects(runner.run(client), /preceding already run migration/);
          assert.equal((await client.query("SELECT to_regclass('out_of_order') AS name")).rows[0].name, null);
        });
      });
    });

    await t.test("another migration connection cannot run while the lock is held", async () => {
      const { PG_MIGRATE_LOCK_ID } = await import("node-pg-migrate");
      const owner = await pool.connect();
      try {
        await owner.query("SELECT pg_advisory_lock($1)", [PG_MIGRATE_LOCK_ID]);
        await withSchema(async (client, schema) => {
          await assert.rejects(new MigrationRunner(undefined, schema).run(client), /Another migration is already running/);
        });
      } finally {
        await owner.query("SELECT pg_advisory_unlock($1)", [PG_MIGRATE_LOCK_ID]);
        owner.release();
      }
    });

    await t.test("an invalid legacy record fails without being marked as migrated", async () => {
      await withSchema(async (client, schema) => {
        await client.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT NOW())");
        await client.query("INSERT INTO schema_migrations (name) VALUES ('001_initial_user_schema')");
        await assert.rejects(new MigrationRunner(undefined, schema).run(client), /missing its tables/);
        assert.equal((await client.query("SELECT count(*)::int AS count FROM pgmigrations")).rows[0].count, 0);
      });
    });
  } finally {
    await pool.end();
  }
});
