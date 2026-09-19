import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../src/config/environment";
import { MigrationRunner } from "../src/database/MigrationRunner";
import { TaskRepository } from "../src/repositories/TaskRepository";
import { OutboxRepository } from "../src/repositories/OutboxRepository";
import { CreateTaskModel } from "../src/models/domain/CreateTaskModel";
import { UpdateTaskModel } from "../src/models/domain/UpdateTaskModel";

test("outbox writes and leases in a disposable schema", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_tasks_test_[a-z0-9_]+$/);
  const schema = "outbox_test_" + randomBytes(6).toString("hex");
  const pool = new Pool({ ...config.database, database: config.database.name, options: "-c search_path=" + schema });
  const client = await pool.connect();
  const directory = await mkdtemp(resolve(tmpdir(), "task-outbox-test-"));
  const tasks = new TaskRepository(pool);
  const outbox = new OutboxRepository(pool);
  const input = (title: string, assignedToUserId: number | null = 2) => new CreateTaskModel({ title, assignedToUserId, ownerUserId: 1, description: "", dueDate: null });
  async function events(taskId: number) { return (await pool.query("SELECT * FROM task_outbox WHERE task_id = $1 ORDER BY occurred_at", [taskId])).rows; }
  try {
    await client.query('CREATE SCHEMA "' + schema + '"');
    for (const file of ["001_initial_task_schema.sql", "002_task_statuses.sql", "003_task_assignment_and_due_date.sql"]) {
      await copyFile(resolve(__dirname, "../migrations", file), resolve(directory, file));
    }
    const runner = new MigrationRunner(directory, schema);
    await runner.run(client);
    await client.query("INSERT INTO tasks (title, owner_user_id, assigned_to_user_id) VALUES ('Existing', 1, 2)");
    const before = (await client.query("SELECT * FROM tasks")).rows;
    await copyFile(resolve(__dirname, "../migrations/004_task_outbox.sql"), resolve(directory, "004_task_outbox.sql"));
    await context.test("migration preserves tasks and does not replay historical assignments", async () => {
      assert.deepEqual(await runner.run(client), ["004_task_outbox"]);
      assert.deepEqual(await runner.run(client), []);
      assert.deepEqual((await client.query("SELECT * FROM tasks")).rows, before);
      assert.equal((await client.query("SELECT * FROM task_outbox")).rowCount, 0);
    });
    await context.test("assigned creation writes one event and unassigned creation writes none", async () => {
      const task = await tasks.create(input("x".repeat(200)));
      const rows = await events(task.id);
      assert.equal(rows.length, 1); assert.equal(rows[0].event_type, "task.assigned");
      assert.equal(rows[0].recipient_user_id, 2); assert.equal(rows[0].title.length, 200);
      assert.equal((await events((await tasks.create(input("Unassigned", null))).id)).length, 0);
    });
    await context.test("only actual non-null assignment changes enqueue events", async () => {
      const task = await tasks.create(input("Assignment history", null));
      await tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: 2 }));
      await tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: 2, title: "New title" }));
      await tasks.updateForUser(task.id, 2, new UpdateTaskModel({ status: "completed" }));
      await tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: 3 }));
      await tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: null }));
      await tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: 2 }));
      assert.deepEqual((await events(task.id)).map(row => [row.event_type, row.recipient_user_id]),
        [["task.assigned", 2], ["task.reassigned", 3], ["task.assigned", 2]]);
      assert.equal(await tasks.updateForUser(task.id, 2, new UpdateTaskModel({ assignedToUserId: 3 })), null);
      assert.equal((await events(task.id)).length, 3);
    });
    await context.test("outbox insertion failures roll back creation and reassignment", async () => {
      await client.query("ALTER TABLE task_outbox ADD CONSTRAINT reject_fixture CHECK (title <> 'rollback fixture')");
      const count = (await client.query("SELECT count(*) FROM tasks")).rows;
      await assert.rejects(tasks.create(input("rollback fixture")));
      assert.deepEqual((await client.query("SELECT count(*) FROM tasks")).rows, count);
      const task = await tasks.create(input("Before failure"));
      await assert.rejects(tasks.updateForUser(task.id, 1, new UpdateTaskModel({ title: "rollback fixture", assignedToUserId: 3 })));
      assert.equal((await tasks.findVisibleById(task.id, 1))?.assignedToUserId, 2);
      assert.equal((await tasks.findVisibleById(task.id, 1))?.title, "Before failure");
      assert.equal((await events(task.id)).length, 1);
      await client.query("ALTER TABLE task_outbox DROP CONSTRAINT reject_fixture");
    });
    await context.test("concurrent identical reassignments emit only one new event", async () => {
      const task = await tasks.create(input("Concurrent"));
      await Promise.all([tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: 3 })),
        tasks.updateForUser(task.id, 1, new UpdateTaskModel({ assignedToUserId: 3 }))]);
      assert.deepEqual((await events(task.id)).map(row => row.recipient_user_id), [2, 3]);
    });
    await context.test("deleting a task retains its already-recorded notification events", async () => {
      const task = await tasks.create(input("Deleted task"));
      await tasks.deleteByOwner(task.id, 1);
      assert.equal((await events(task.id)).length, 1);
    });
    await context.test("competing publishers claim different events and expired claims can be recovered", async () => {
      const [first, second] = await Promise.all([outbox.claim(), outbox.claim()]);
      assert.ok(first && second); assert.notEqual(first.event.eventId, second.event.eventId);
      await outbox.retry(first);
      let row = (await client.query("SELECT * FROM task_outbox WHERE event_id = $1", [first.event.eventId])).rows[0];
      assert.equal(row.published_at, null); assert.equal(row.lease_id, null);
      assert.ok(row.available_at.getTime() > Date.now());
      await client.query("UPDATE task_outbox SET available_at = now() - interval '1 day' WHERE event_id = $1", [first.event.eventId]);
      const recovered = await outbox.claim(); assert.ok(recovered);
      assert.equal(recovered.event.eventId, first.event.eventId); assert.notEqual(recovered.leaseId, first.leaseId);
      await outbox.markPublished(first);
      row = (await client.query("SELECT * FROM task_outbox WHERE event_id = $1", [first.event.eventId])).rows[0];
      assert.equal(row.published_at, null, "A stale publisher must not complete a newer lease.");
      await outbox.markPublished(recovered);
      assert.ok((await client.query("SELECT published_at FROM task_outbox WHERE event_id = $1", [first.event.eventId])).rows[0].published_at);
      await client.query("UPDATE task_outbox SET available_at = now() - interval '1 day' WHERE event_id = $1", [second.event.eventId]);
      assert.equal((await outbox.claim())?.event.eventId, second.event.eventId, "A crashed publisher's claim is recoverable.");
    });
  } finally {
    await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    client.release(); await pool.end(); await rm(directory, { recursive: true, force: true });
  }
});
