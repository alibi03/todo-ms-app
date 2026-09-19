import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { EventValidator } from "../src/messaging/EventValidator";
import { NotificationConsumer } from "../src/messaging/NotificationConsumer";
import { NotificationService } from "../src/services/NotificationService";
import { TaskAssignmentEventDto } from "../src/models/dto/events/TaskAssignmentEventDto";
import { TaskAssignmentDataDto } from "../src/models/dto/events/TaskAssignmentDataDto";
import { CreateNotificationModel } from "../src/models/domain/CreateNotificationModel";
import { loadConfig } from "../src/config/environment";
import { loadBrokerConfig } from "../src/config/broker";

const event = { eventId: randomUUID(), version: 1, type: "task.assigned", occurredAt: "2026-09-19T00:00:00.000Z",
  data: { taskId: 1, recipientUserId: 2, title: "Task" } };
function message(value: unknown = event): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(value)), properties: { contentType: "application/json", messageId: event.eventId, type: event.type },
    fields: { routingKey: event.type } } as ConsumeMessage;
}
const broker = { hostname: "unused", port: 5672, username: "unused", password: "unused", vhost: "unused" };

test("message validation builds nested DTOs without coercing IDs", async () => {
  const dto = await EventValidator.parse(message());
  assert.ok(dto instanceof TaskAssignmentEventDto);
  assert.ok(dto.data instanceof TaskAssignmentDataDto);
  assert.equal(dto.data.recipientUserId, 2);
  for (const data of [{ ...event.data, taskId: "1" }, { ...event.data, recipientUserId: 0 }, { ...event.data, recipientUserId: 2147483648 }]) {
    await assert.rejects(EventValidator.parse(message({ ...event, data })));
  }
});

test("unsupported, missing, malformed and additional event fields are rejected", async () => {
  for (const value of [null, [], {}, { ...event, version: 2 }, { ...event, type: "task.deleted" }, { ...event, eventId: "bad" },
    { ...event, occurredAt: "not-a-date" }, { ...event, occurredAt: "0000-01-01T00:00:00.000Z" },
    { ...event, occurredAt: "2026-02-30T00:00:00.000Z" }, { ...event, data: null }, { ...event, data: [] },
    { ...event, token: "should-not-be-present" }, { ...event, data: { ...event.data, email: "private@example.test" } }]) {
    await assert.rejects(EventValidator.parse(message(value)));
  }
  const malformed = message(); malformed.content = Buffer.from("{");
  await assert.rejects(EventValidator.parse(malformed));
});

test("event title boundaries match the Task API, including Unicode", async () => {
  for (const title of ["x".repeat(200), "😀".repeat(200)]) {
    assert.equal((await EventValidator.parse(message({ ...event, data: { ...event.data, title } }))).data.title, title);
  }
  for (const title of ["", "x".repeat(201), "invalid\u0000title", "line\nbreak"]) {
    await assert.rejects(EventValidator.parse(message({ ...event, data: { ...event.data, title } })));
  }
});

test("transport metadata and message size are checked before storage", async () => {
  for (const change of [{ contentType: "text/plain" }, { messageId: randomUUID() }, { type: "task.reassigned" }]) {
    const input = message(); Object.assign(input.properties, change); await assert.rejects(EventValidator.parse(input));
  }
  const route = message(); route.fields.routingKey = "task.reassigned"; await assert.rejects(EventValidator.parse(route));
  const large = message(); large.content = Buffer.alloc(16385); await assert.rejects(EventValidator.parse(large));
});

test("notification service maps the contract to a domain model before repository access", async () => {
  const service = new NotificationService({ async createOnce(model) {
    assert.ok(model instanceof CreateNotificationModel);
    assert.deepEqual({ ...model }, { eventId: event.eventId, eventType: event.type, taskId: 1, recipientUserId: 2,
      title: "Task", occurredAt: new Date(event.occurredAt) });
  } });
  await service.process(await EventValidator.parse(message()));
});

test("consumer acknowledges only after the notification is persisted", async () => {
  const calls: string[] = [];
  const consumer = new NotificationConsumer(broker, { async process() { calls.push("stored"); } });
  const channel = { ack() { calls.push("ack"); } } as unknown as ConfirmChannel;
  await consumer.handle(channel, message());
  assert.deepEqual(calls, ["stored", "ack"]);
});

test("storage failures leave the original message unacknowledged", async () => {
  const consumer = new NotificationConsumer(broker, { async process() { throw new Error("database down"); } });
  await assert.rejects(consumer.handle({ ack() { assert.fail("Must not acknowledge failed storage"); } } as unknown as ConfirmChannel, message()));
});

test("poison messages are confirmed in the rejected queue before acknowledging the original", async () => {
  const calls: string[] = [];
  const consumer = new NotificationConsumer(broker, { async process() { assert.fail(); } }, { error() {} });
  const channel = Object.assign(new EventEmitter(), {
    publish(exchange: string, queue: string, _content: Buffer, _options: unknown, confirm: () => void) {
      assert.equal(exchange, ""); assert.equal(queue, "notification.assignments.rejected.v1"); calls.push("rejected"); confirm(); return true;
    }, ack() { calls.push("ack"); },
  }) as unknown as ConfirmChannel;
  await consumer.handle(channel, message({}));
  assert.deepEqual(calls, ["rejected", "ack"]);
});

test("failed dead-letter delivery keeps the original message unacknowledged", async () => {
  const consumer = new NotificationConsumer(broker, { async process() { assert.fail(); } }, { error() {} });
  const channel = Object.assign(new EventEmitter(), {
    publish(_exchange: string, _queue: string, _content: Buffer, _options: unknown, confirm: (error: Error) => void) { confirm(new Error("unavailable")); return true; },
    ack() { assert.fail(); },
  }) as unknown as ConfirmChannel;
  await assert.rejects(consumer.handle(channel, message({})));
});

test("new classes use regular methods and explicit constructor dependencies", () => {
  assert.equal(Object.hasOwn(NotificationConsumer.prototype, "handle"), true);
  assert.equal(Object.hasOwn(NotificationService.prototype, "process"), true);
});

test("notification configuration is independent of user and task credentials", () => {
  const env = { DB_HOST: "notification-db", DB_NAME: "notifications", DB_USER: "notification", DB_PASSWORD: "test-only" };
  assert.deepEqual(loadConfig(env).database, { host: "notification-db", name: "notifications", user: "notification", password: "test-only", port: 5432 });
  assert.equal("jwtSecret" in loadConfig(env), false);
  for (const key of Object.keys(env)) assert.throws(() => loadConfig({ ...env, [key]: "" }));
  for (const value of ["0", "65536", "1.2"]) assert.throws(() => loadConfig({ ...env, DB_PORT: value }));
  assert.throws(() => loadBrokerConfig({}));
});
