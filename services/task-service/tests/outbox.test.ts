import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { ConfirmChannel } from "amqplib";
import { loadBrokerConfig } from "../src/config/broker";
import { OutboxMapper } from "../src/mappers/OutboxMapper";
import { OutboxDispatcher } from "../src/services/OutboxDispatcher";
import { ConfirmedDelivery } from "../src/messaging/ConfirmedDelivery";
import { MessagingTimeout } from "../src/messaging/MessagingTimeout";
import type { OutboxDelivery } from "../src/models/domain/OutboxDelivery";

const delivery: OutboxDelivery = {
  leaseId: "lease", attempts: 1,
  event: { eventId: "id", version: 1, type: "task.assigned", occurredAt: new Date().toISOString(), data: { taskId: 1, recipientUserId: 2, title: "Task" } },
};

test("outbox marks delivery only after the broker confirms it", async () => {
  const calls: string[] = [];
  const dispatcher = new OutboxDispatcher({
    async claim() { return delivery; }, async markPublished(value) { assert.equal(value, delivery); calls.push("saved"); },
    async retry() { calls.push("retry"); },
  }, { async publish(event) { assert.equal(event, delivery.event); calls.push("confirmed"); }, async close() {} });
  assert.equal(await dispatcher.dispatchOne(), true);
  assert.deepEqual(calls, ["confirmed", "saved"]);
});

test("publish or post-confirm database failure retries the same event without logging its payload", async () => {
  for (const failure of ["publish", "mark"]) {
    const logs: string[] = [];
    const calls: string[] = [];
    const dispatcher = new OutboxDispatcher({
      async claim() { return delivery; },
      async markPublished() { calls.push("mark"); throw new Error("private database details"); },
      async retry(value) { assert.equal(value.event.eventId, delivery.event.eventId); calls.push("retry"); },
    }, { async publish() { if (failure === "publish") throw new Error("private broker password"); }, async close() {} },
    { error(message) { logs.push(message); } });
    await dispatcher.dispatchOne();
    assert.deepEqual(calls, failure === "publish" ? ["retry"] : ["mark", "retry"]);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs.join(""), /private|password|Task/);
  }
});

test("an empty outbox does not publish and shutdown closes the publisher", async () => {
  let closed = false;
  const dispatcher = new OutboxDispatcher({ async claim() { return null; }, async markPublished() { assert.fail(); }, async retry() { assert.fail(); } },
    { async publish() { assert.fail(); }, async close() { closed = true; } });
  assert.equal(await dispatcher.dispatchOne(), false);
  dispatcher.start();
  await dispatcher.stop();
  assert.equal(closed, true);
});

test("outbox mapping publishes only the versioned event contract", () => {
  const record = { event_id: "id", event_type: "task.reassigned" as const, task_id: 4, recipient_user_id: 5,
    title: "Title", occurred_at: new Date("2026-09-19T00:00:00.000Z"), lease_id: "lease", attempts: 2, password: "not-public" };
  const result = OutboxMapper.toDelivery(record);
  assert.deepEqual(result.event, { eventId: "id", version: 1, type: "task.reassigned", occurredAt: "2026-09-19T00:00:00.000Z",
    data: { taskId: 4, recipientUserId: 5, title: "Title" } });
});

test("mandatory returned messages and broker rejections are not treated as successful delivery", async () => {
  for (const mode of ["success", "returned", "rejected"]) {
    const emitter = new EventEmitter();
    const channel = Object.assign(emitter, {
      publish(_exchange: string, _key: string, _body: Buffer, options: { persistent: boolean; mandatory: boolean }, callback: (error?: Error) => void) {
        assert.equal(options.persistent, true); assert.equal(options.mandatory, true);
        if (mode === "returned") emitter.emit("return", {});
        callback(mode === "rejected" ? new Error("Rejected") : undefined);
        return false;
      },
    }) as unknown as ConfirmChannel;
    const result = ConfirmedDelivery.send(channel, "exchange", "route", Buffer.from("{}"), {});
    if (mode === "success") await result; else await assert.rejects(result);
    assert.equal(emitter.listenerCount("return"), 0);
  }
});

test("messaging timeouts are bounded and successful operations retain their result", async () => {
  await assert.rejects(MessagingTimeout.run(new Promise(() => undefined), 5), /timed out/);
  assert.equal(await MessagingTimeout.run(Promise.resolve(3), 5), 3);
});

test("broker configuration requires separate credentials and never includes their values in errors", () => {
  const environment = { RABBITMQ_HOST: "rabbitmq", RABBITMQ_USER: "app", RABBITMQ_PASSWORD: "test-only", RABBITMQ_VHOST: "test" };
  assert.equal(loadBrokerConfig(environment).port, 5672);
  for (const key of Object.keys(environment)) assert.throws(() => loadBrokerConfig({ ...environment, [key]: "" }));
  for (const port of ["0", "65536", "1.2", "secret"]) {
    assert.throws(() => loadBrokerConfig({ ...environment, RABBITMQ_PORT: port }), error => error instanceof Error && !error.message.includes(port));
  }
});
