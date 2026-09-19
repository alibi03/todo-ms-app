import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { DockerTestStack } from "./DockerTestStack";

test("assignment notifications survive Docker delivery failures", { timeout: 240000 }, async context => {
  const stack = new DockerTestStack(process.env.E2E_DOCKER_PROJECT ?? "");
  const userUrl = process.env.E2E_USER_URL;
  let taskUrl = process.env.E2E_TASK_URL;
  assert.ok(userUrl && taskUrl);
  const suffix = randomBytes(5).toString("hex");
  async function waitFor(check: () => Promise<boolean>, label: string): Promise<void> {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try { if (await check()) return; } catch { /* A restarting dependency may not be ready yet. */ }
      await delay(300);
    }
    assert.fail("Timed out: " + label);
  }
  async function account(label: string) {
    const email = label + suffix + "@example.test";
    const password = "Test-only-" + randomBytes(12).toString("hex");
    const response = await fetch(userUrl + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: label + suffix, email, password }) });
    assert.equal(response.status, 201);
    const { user } = await response.json() as { user: { id: number } };
    const login = await fetch(userUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    assert.equal(login.status, 200);
    const { token } = await login.json() as { token: string };
    return { id: user.id, token };
  }
  const owner = await account("owner");
  const bob = await account("bob");
  const carol = await account("carol");
  async function create(title: string, assignee = bob.id): Promise<number> {
    const response = await fetch(taskUrl + "/api/tasks", { method: "POST", headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" },
      body: JSON.stringify({ title, assignedToUserId: assignee, dueDate: "2028-02-29" }) });
    assert.equal(response.status, 201);
    return ((await response.json()) as { task: { id: number } }).task.id;
  }
  async function update(id: number, body: unknown, token = owner.token): Promise<number> {
    const response = await fetch(taskUrl + "/api/tasks/" + String(id), { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await response.arrayBuffer();
    return response.status;
  }
  const events = (id: number) => stack.query("task-service", "SELECT * FROM task_outbox WHERE task_id = $1 ORDER BY occurred_at", [id]);
  const notifications = (id: number) => stack.query("notification-service", "SELECT * FROM notifications WHERE task_id = $1 ORDER BY occurred_at", [id]);
  const delivered = async (id: number, count = 1) => waitFor(async () => (await notifications(id)).length === count && (await events(id)).every(row => row.published_at), "notification delivery");
  let taskId = 0;
  try {
    await context.test("assignment reaches the correct recipient through RabbitMQ", async () => {
      taskId = await create("x".repeat(200)); await delivered(taskId);
      const rows = await notifications(taskId);
      assert.equal(rows[0]?.recipient_user_id, bob.id); assert.equal(rows[0]?.event_type, "task.assigned");
      assert.equal(String(rows[0]?.title).length, 200);
    });
    await context.test("reassignment targets the new recipient; unchanged, status-only and forbidden writes emit nothing", async () => {
      assert.equal(await update(taskId, { assignedToUserId: bob.id }), 200);
      assert.equal(await update(taskId, { status: "completed" }, bob.token), 200);
      assert.equal(await update(taskId, { assignedToUserId: carol.id }, bob.token), 403);
      assert.equal(await update(taskId, { assignedToUserId: 2147483647 }), 400);
      assert.equal((await events(taskId)).length, 1);
      assert.equal(await update(taskId, { assignedToUserId: carol.id }), 200); await delivered(taskId, 2);
      assert.equal((await notifications(taskId))[1]?.recipient_user_id, carol.id);
      assert.equal((await notifications(taskId))[1]?.event_type, "task.reassigned");
      assert.equal(await update(taskId, { assignedToUserId: null }), 200);
      assert.equal((await events(taskId)).length, 2);
    });
    await context.test("redelivery of the same event does not create duplicate notifications", async () => {
      const row = (await events(taskId))[0]!;
      const event = { eventId: row.event_id, version: 1, type: row.event_type, occurredAt: row.occurred_at,
        data: { taskId, recipientUserId: row.recipient_user_id, title: row.title } };
      for (let index = 0; index < 3; index++) await stack.publish(event);
      await waitFor(async () => await stack.queueCount("notification.assignments.v1") === 0, "duplicate consumption");
      await delay(300);
      assert.equal((await notifications(taskId)).length, 2);
    });
    await context.test("malformed events move to the rejected queue while valid delivery continues", async () => {
      const before = await stack.queueCount("notification.assignments.rejected.v1");
      await stack.publish({ eventId: randomUUID(), type: "task.assigned", version: 99 });
      await waitFor(async () => await stack.queueCount("notification.assignments.rejected.v1") === before + 1, "rejected event");
      await delivered(await create("After poison " + suffix));
    });
    await context.test("worker downtime and a broker restart preserve queued events", async () => {
      await stack.control("stop", "notification-service");
      const id = await create("Queued " + suffix);
      await waitFor(async () => (await events(id))[0]?.published_at != null, "broker confirmation while consumer is down");
      await stack.control("restart", "rabbitmq");
      await waitFor(async () => await stack.queueCount("notification.assignments.v1") >= 1, "durable queue after broker restart");
      await stack.control("start", "notification-service"); await delivered(id);
    });
    await context.test("broker outage keeps the Task API usable and retries persisted events after recovery", async () => {
      await stack.control("stop", "rabbitmq");
      await waitFor(async () => await stack.health("notification-service") === 503, "unavailable broker health");
      const id = await create("Outage " + suffix);
      assert.equal(await stack.health("task-service"), 200);
      assert.equal((await events(id))[0]?.published_at, null);
      await stack.control("restart", "task-service");
      await waitFor(async () => await stack.health("task-service") === 200, "Task API restart without broker");
      taskUrl = await stack.url("task-service");
      assert.equal((await events(id))[0]?.published_at, null);
      await stack.control("start", "rabbitmq"); await delivered(id);
    });
    await context.test("notification database outage leaves messages pending until storage recovers", async () => {
      await stack.control("stop", "notification-db");
      let id: number;
      try {
        id = await create("Database outage " + suffix);
        await waitFor(async () => (await events(id))[0]?.published_at != null, "outage event published");
        await waitFor(async () => await stack.health("notification-service") === 503, "database outage health");
      } finally { await stack.control("start", "notification-db"); }
      await delivered(id);
    });
    await context.test("stored notifications survive service and database restarts", async () => {
      const before = await notifications(taskId);
      await stack.control("restart", "notification-service");
      await stack.control("restart", "notification-db");
      await waitFor(async () => await stack.health("notification-service") === 200, "recovered notification health");
      assert.deepEqual(await notifications(taskId), before);
    });
  } finally {
    for (const service of ["rabbitmq", "notification-db", "notification-service", "task-service"]) await stack.control("start", service);
  }
});
