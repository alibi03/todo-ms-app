import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config/environment";
import TaskDatabase from "../src/database/TaskDatabase";
import Task from "../src/models/domain/Task";
import TaskRepository from "../src/repositories/TaskRepository";
import TaskService from "../src/services/TaskService";

test("task storage and migrations in a disposable database", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_tasks_test_[a-z0-9_]+$/, "Only disposable test databases are allowed.");
  const database = new TaskDatabase(config.database);
  const repository = new TaskRepository(database);
  const service = new TaskService(repository);
  try {
    await context.test("migration applies once and repeated startup preserves data", async () => {
      await database.migrate();
      const created = await service.create(10, { title: "Persistent task" });
      await database.migrate();
      assert.equal((await service.list(10, {})).tasks[0]?.id, created.id);
      const migrations = await database.query("SELECT name FROM pgmigrations");
      assert.deepEqual(migrations.rows, [{ name: "001_initial_task_schema" }]);
    });
    await context.test("owner-filtered SQL and cursor pagination isolate users", async () => {
      await service.create(20, { title: "Other owner" });
      await service.create(10, { title: "Next task" });
      const first = await service.list(10, { limit: "1" });
      assert.ok(first.nextCursor);
      const next = await service.list(10, { after: String(first.nextCursor), limit: "1" });
      assert.equal(next.tasks[0]?.title, "Next task");
      assert.equal(next.nextCursor, null);
      assert.equal((await service.list(20, {})).tasks.length, 1);
      assert.equal((await service.list(30, {})).tasks.length, 0);
    });
    await context.test("SQL-like input remains data and records map to domain instances", async () => {
      const title = "x'); DROP TABLE tasks; --";
      const task = await service.create(30, { title, description: "line 1\nline 2" });
      assert.ok(task instanceof Task);
      assert.equal(task.title, title);
      assert.ok(task.createdAt instanceof Date);
      assert.equal((await service.list(30, {})).tasks[0]?.description, "line 1\nline 2");
    });
    await context.test("database enforces title, owner and status constraints", async () => {
      await assert.rejects(database.query("INSERT INTO tasks (title, owner_user_id) VALUES ($1, $2)", [" ", 10]));
      await assert.rejects(database.query("INSERT INTO tasks (title, owner_user_id) VALUES ($1, $2)", ["Task", 0]));
      await assert.rejects(database.query("INSERT INTO tasks (title, owner_user_id, status) VALUES ($1, $2, $3)", ["Task", 10, "completed"]));
    });
    await context.test("task database has no user tables or cross-database foreign keys", async () => {
      const result = await database.query("SELECT to_regclass('users') AS users");
      assert.equal(result.rows[0]?.users, null);
      const keys = await database.query("SELECT conname FROM pg_constraint WHERE conrelid = 'tasks'::regclass AND contype = 'f'");
      assert.equal(keys.rowCount, 0);
    });
  } finally {
    await database.close();
  }
});
