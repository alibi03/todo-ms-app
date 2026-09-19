import { testUserClient } from "./testUserClient";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../src/config/environment";
import { TaskDatabase } from "../src/database/TaskDatabase";
import { Task } from "../src/models/domain/Task";
import { UpdateTaskModel } from "../src/models/domain/UpdateTaskModel";
import { TaskRepository } from "../src/repositories/TaskRepository";
import { TaskService } from "../src/services/TaskService";

test("task storage and migrations in a disposable database", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_tasks_test_[a-z0-9_]+$/, "Only disposable test databases are allowed.");
  const database = new TaskDatabase(config.database);
  const repository = new TaskRepository(database);
  const service = new TaskService(repository, testUserClient);
  try {
    await context.test("migration applies once and repeated startup preserves data", async () => {
      await database.migrate();
      const created = await service.create(10, { title: "Persistent task" }, "test-token");
      await database.migrate();
      assert.equal((await service.list(10, {})).tasks[0]?.id, created.id);
      const migrations = await database.query("SELECT name FROM pgmigrations ORDER BY id");
      assert.deepEqual(migrations.rows, [{ name: "001_initial_task_schema" }, { name: "002_task_statuses" }, { name: "003_task_assignment_and_due_date" }, { name: "004_task_outbox" }]);
    });
    await context.test("owner-filtered SQL and cursor pagination isolate users", async () => {
      await service.create(20, { title: "Other owner" }, "test-token");
      await service.create(10, { title: "Next task" }, "test-token");
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
      const task = await service.create(30, { title, description: "line 1\nline 2" }, "test-token");
      assert.ok(task instanceof Task);
      assert.equal(task.title, title);
      assert.ok(task.createdAt instanceof Date);
      assert.equal((await service.list(30, {})).tasks[0]?.description, "line 1\nline 2");
    });
    await context.test("database enforces title, owner and status constraints", async () => {
      await assert.rejects(database.query("INSERT INTO tasks (title, owner_user_id) VALUES ($1, $2)", [" ", 10]));
      await assert.rejects(database.query("INSERT INTO tasks (title, owner_user_id) VALUES ($1, $2)", ["Task", 0]));
      await assert.rejects(database.query("INSERT INTO tasks (title, owner_user_id, status) VALUES ($1, $2, $3)", ["Task", 10, "archived"]));
    });
    await context.test("task database has no user tables or cross-database foreign keys", async () => {
      const result = await database.query("SELECT to_regclass('users') AS users");
      assert.equal(result.rows[0]?.users, null);
      const keys = await database.query("SELECT conname FROM pg_constraint WHERE conrelid = 'tasks'::regclass AND contype = 'f'");
      assert.equal(keys.rowCount, 0);
    });
    await context.test("partial updates preserve omitted fields and accept every status", async () => {
      const original = await service.create(40, { title: "Original", description: "Keep" }, "test-token");
      const updated = await service.update(40, original.id, { title: "Edited" }, "test-token");
      assert.equal(updated.description, "Keep");
      assert.equal(updated.ownerUserId, original.ownerUserId);
      assert.deepEqual(updated.createdAt, original.createdAt);
      for (const status of ["in_progress", "completed", "pending"] as const) {
        assert.equal((await service.update(40, original.id, { status }, "test-token")).status, status);
      }
      assert.equal((await service.update(40, original.id, { description: "" }, "test-token")).description, "");
      await database.migrate();
      assert.equal((await service.list(40, {})).tasks[0]?.title, "Edited");
    });
    await context.test("owner filters protect UPDATE and DELETE atomically", async () => {
      const task = await service.create(50, { title: "Owner only" }, "test-token");
      const before = (await database.query("SELECT * FROM tasks WHERE id = $1", [task.id])).rows;
      await assert.rejects(service.update(60, task.id, { title: "Forbidden" }, "test-token"), { message: "Task not found." });
      await assert.rejects(service.delete(60, task.id), { message: "Task not found." });
      assert.deepEqual((await database.query("SELECT * FROM tasks WHERE id = $1", [task.id])).rows, before);
      await service.delete(50, task.id);
      assert.equal((await service.list(50, {})).tasks.length, 0);
      await assert.rejects(service.delete(50, task.id), { message: "Task not found." });
      await assert.rejects(service.update(50, task.id, { title: "Gone" }, "test-token"), { message: "Task not found." });
    });
    await context.test("concurrent partial updates do not overwrite omitted fields", async () => {
      const task = await service.create(70, { title: "Original", description: "Original description" }, "test-token");
      await Promise.all([
        service.update(70, task.id, { title: "New title" }, "test-token"),
        service.update(70, task.id, { description: "New description" }, "test-token"),
      ]);
      const updated = (await service.list(70, {})).tasks[0];
      assert.equal(updated?.title, "New title");
      assert.equal(updated?.description, "New description");
    });
    await context.test("SQL-like update content stays data", async () => {
      const task = await service.create(80, { title: "Original" }, "test-token");
      const title = "x'; DELETE FROM tasks; --";
      assert.equal((await service.update(80, task.id, { title }, "test-token")).title, title);
      assert.equal((await service.list(80, {})).tasks.length, 1);
    });
    await context.test("assignment and dates persist and clearing differs from omission", async () => {
      const task = await service.create(91, { title: "Assigned", assignedToUserId: 2, dueDate: "2028-02-29" }, "test-token");
      assert.equal((await service.list(2, {})).tasks[0]?.id, task.id);
      const renamed = await service.update(91, task.id, { title: "Renamed" }, "test-token");
      assert.equal(renamed.dueDate, "2028-02-29");
      assert.equal(renamed.assignedToUserId, 2);
      await database.migrate();
      assert.equal((await repository.findVisibleById(task.id, 2))?.dueDate, "2028-02-29");
      const cleared = await service.update(91, task.id, { assignedToUserId: null, dueDate: null }, "test-token");
      assert.equal(cleared.assignedToUserId, null);
      assert.equal(cleared.dueDate, null);
      assert.equal(await repository.findVisibleById(task.id, 2), null);
    });
    await context.test("SQL independently limits assignees to status updates and prevents deletion", async () => {
      const task = await service.create(92, { title: "Owner", assignedToUserId: 2 }, "test-token");
      assert.equal((await repository.updateForUser(task.id, 2, new UpdateTaskModel({ status: "completed" })))?.status, "completed");
      for (const update of [{ title: "No" }, { assignedToUserId: 3 }, { dueDate: null }, { status: "pending" as const, title: "No" }]) {
        assert.equal(await repository.updateForUser(task.id, 2, new UpdateTaskModel(update)), null);
      }
      assert.equal(await repository.deleteByOwner(task.id, 2), false);
      await service.update(92, task.id, { assignedToUserId: 3 }, "test-token");
      assert.equal(await repository.updateForUser(task.id, 2, new UpdateTaskModel({ status: "pending" })), null);
      assert.equal((await repository.updateForUser(task.id, 3, new UpdateTaskModel({ status: "pending" })))?.status, "pending");
    });
    await context.test("date-only results are stable across database timezones", async () => {
      const task = await service.create(93, { title: "Calendar", dueDate: "2028-02-29" }, "test-token");
      const pool = new Pool({ ...config.database, database: config.database.name });
      const client = await pool.connect();
      try {
        const scoped = new TaskRepository(client);
        for (const zone of ["Pacific/Kiritimati", "America/Los_Angeles", "Europe/Istanbul"]) {
          await client.query("SELECT set_config('TimeZone', $1, false)", [zone]);
          assert.equal((await scoped.findVisibleById(task.id, 93))?.dueDate, "2028-02-29");
        }
      } finally { client.release(); await pool.end(); }
    });
    await context.test("a waiting UPDATE rechecks assignment after the owner commits a reassignment", async () => {
      const task = await service.create(94, { title: "Concurrent", assignedToUserId: 2 }, "test-token");
      const pool = new Pool({ ...config.database, database: config.database.name });
      const owner = await pool.connect();
      const assignee = await pool.connect();
      let pending: Promise<Task | null> | undefined;
      try {
        await assignee.query("SET statement_timeout = '5s'");
        const pid = (await assignee.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await owner.query("BEGIN");
        await owner.query("UPDATE tasks SET assigned_to_user_id = 3 WHERE id = $1", [task.id]);
        pending = new TaskRepository(assignee).updateForUser(task.id, 2, new UpdateTaskModel({ status: "completed" }));
        void pending.catch(() => undefined);
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const state = await database.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid]);
          if (state.rows[0]?.wait_event_type === "Lock") { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, "Assignee update must be waiting on the owner's row lock.");
        await owner.query("COMMIT");
        assert.equal(await pending, null);
        assert.equal((await repository.findVisibleById(task.id, 94))?.status, "pending");
      } finally {
        await owner.query("ROLLBACK");
        await pending?.catch(() => undefined);
        owner.release(); assignee.release(); await pool.end();
      }
    });
  } finally {
    await database.close();
  }
});
