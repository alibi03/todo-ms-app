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
    await context.test("listing is recipient-scoped, newest-first and keeps SQL-like titles as data", async () => {
      const page = await service.list(20, {});
      assert.equal(page.notifications.length, 1);
      assert.equal(page.notifications[0]?.title, event.data.title);
      assert.equal(page.nextCursor, null);
      assert.deepEqual(await service.list(2147483647, {}), { notifications: [], nextCursor: null });
      assert.notEqual((await service.list(30, {})).notifications[0]?.id, page.notifications[0]?.id);
    });
    await context.test("pagination excludes newer arrivals and duplicate redelivery preserves the cursor ID", async () => {
      const events = Array.from({ length: 4 }, (_, index) => ({ ...event, eventId: randomUUID(), data: { ...event.data, recipientUserId: 40, title: "Page " + index } }));
      for (const next of events) await service.process(next);
      const first = await service.list(40, { limit: "2" });
      assert.deepEqual(first.notifications.map(row => row.title), ["Page 3", "Page 2"]);
      assert.ok(first.nextCursor);
      const saved = first.notifications[0]!;
      await service.process(events[3]!);
      assert.equal((await service.list(40, { limit: "1" })).notifications[0]?.id, saved.id);
      await service.process({ ...events[0]!, eventId: randomUUID(), data: { ...events[0]!.data, title: "New arrival" } });
      const second = await service.list(40, { limit: "2", before: String(first.nextCursor) });
      assert.deepEqual(second.notifications.map(row => row.title), ["Page 1", "Page 0"]);
      assert.equal(second.nextCursor, null);
      assert.deepEqual(await service.list(40, { before: "1" }), { notifications: [], nextCursor: null });
    });
    await context.test("the recipient cursor index and both migrations are present once", async () => {
      await database.migrate();
      assert.deepEqual((await database.query("SELECT name FROM pgmigrations ORDER BY id")).rows,
        [{ name: "001_notifications" }, { name: "002_notification_listing" }]);
      assert.equal((await database.query("SELECT indexname FROM pg_indexes WHERE tablename = 'notifications' AND indexname = 'notifications_recipient_id_index'")).rowCount, 1);
    });
  } finally { await database.close(); }
});
