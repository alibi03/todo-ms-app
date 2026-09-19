import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { loadConfig } from "../src/config/environment";
import { NotificationDatabase } from "../src/database/NotificationDatabase";
import { NotificationRepository } from "../src/repositories/NotificationRepository";
import { NotificationService } from "../src/services/NotificationService";
import { TaskAssignmentEventDto } from "../src/models/dto/events/TaskAssignmentEventDto";

test("notification persistence uses a disposable database", async context => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_notifications_test_[a-z0-9_]+$/);
  const database = new NotificationDatabase(config.database);
  const service = new NotificationService(new NotificationRepository(database));
  const event: TaskAssignmentEventDto = {
    eventId: randomUUID(), version: 1, type: "task.assigned", occurredAt: "2026-09-19T00:00:00.000Z",
    data: { taskId: 10, recipientUserId: 20, title: "x'); DROP TABLE notifications; --" },
  };
  try {
    await context.test("migration is repeatable and preserves saved notifications", async () => {
      await database.migrate(); await service.process(event); await database.migrate();
      const rows = await database.query("SELECT * FROM notifications WHERE event_id = $1", [event.eventId]);
      assert.equal(rows.rowCount, 1); assert.equal(rows.rows[0]?.title, event.data.title);
      assert.equal(rows.rows[0]?.occurred_at.toISOString(), event.occurredAt);
    });
    await context.test("sequential and concurrent redelivery store the event only once", async () => {
      await service.process(event);
      await Promise.all(Array.from({ length: 10 }, () => service.process(event)));
      assert.equal((await database.query("SELECT * FROM notifications WHERE event_id = $1", [event.eventId])).rowCount, 1);
    });
    await context.test("different events for the same task remain separate notifications", async () => {
      const next = { ...event, eventId: randomUUID(), type: "task.reassigned" as const, data: { ...event.data, recipientUserId: 30 } };
      await service.process(next);
      assert.equal((await database.query("SELECT * FROM notifications WHERE event_id = $1 AND recipient_user_id = 30", [next.eventId])).rowCount, 1);
    });
    await context.test("invalid storage values fail without partial notifications", async () => {
      const invalid = { ...event, eventId: randomUUID(), data: { ...event.data, recipientUserId: 0 } };
      await assert.rejects(service.process(invalid));
      assert.equal((await database.query("SELECT * FROM notifications WHERE event_id = $1", [invalid.eventId])).rowCount, 0);
    });
    await context.test("notification storage has no task or user tables or cross-database keys", async () => {
      assert.deepEqual((await database.query("SELECT to_regclass('users') AS users, to_regclass('tasks') AS tasks")).rows, [{ users: null, tasks: null }]);
      assert.equal((await database.query("SELECT * FROM pg_constraint WHERE conrelid = 'notifications'::regclass AND contype = 'f'")).rowCount, 0);
    });
  } finally { await database.close(); }
});
