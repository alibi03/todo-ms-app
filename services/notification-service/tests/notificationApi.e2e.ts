import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { ListNotificationsResponse } from "../src/models/dto/responses/ListNotificationsResponse";
import { DockerTestStack } from "./DockerTestStack";

function request(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
}

test("notification listing authenticates recipients across Docker services", { timeout: 240000 }, async context => {
  const stack = new DockerTestStack(process.env.E2E_DOCKER_PROJECT ?? "");
  let userUrl = await stack.url("user-service");
  const taskUrl = await stack.url("task-service");
  let notificationUrl = await stack.url("notification-service");
  const suffix = randomBytes(5).toString("hex");
  async function waitFor(check: () => Promise<boolean>, label: string): Promise<void> {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try { if (await check()) return; } catch { /* Dependencies may still be restarting. */ }
      await delay(300);
    }
    assert.fail("Timed out: " + label);
  }
  async function account(label: string) {
    const credentials = { email: label + suffix + "@example.test", password: "Test-only-" + randomBytes(12).toString("hex") };
    const response = await request(userUrl + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...credentials, username: label + suffix }) });
    assert.equal(response.status, 201);
    const { user } = await response.json() as { user: { id: number } };
    const login = await request(userUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    assert.equal(login.status, 200);
    const { token } = await login.json() as { token: string };
    return { id: user.id, token };
  }
  const owner = await account("apiowner");
  const recipient = await account("apirecipient");
  const other = await account("apiother");
  async function list(token: string, query = ""): Promise<ListNotificationsResponse> {
    const response = await request(notificationUrl + "/api/notifications" + query, { headers: { Authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return await response.json() as ListNotificationsResponse;
  }
  async function create(title: string, assignee: number): Promise<number> {
    const response = await request(taskUrl + "/api/tasks", { method: "POST", headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" },
      body: JSON.stringify({ title, assignedToUserId: assignee }) });
    assert.equal(response.status, 201);
    const { task } = await response.json() as { task: { id: number } };
    await waitFor(async () => (await stack.query("notification-service", "SELECT event_id FROM notifications WHERE task_id = $1", [task.id])).length === 1, "assignment stored");
    return task.id;
  }
  let taskId = 0;
  try {
    await context.test("real task events are listed only for their recipients, not their owner or another user", async () => {
      taskId = await create("First " + suffix, recipient.id);
      await create("Second " + suffix, recipient.id);
      await create("Third " + suffix, recipient.id);
      await create("Other " + suffix, other.id);
      const page = await list(recipient.token);
      assert.deepEqual(page.notifications.map(row => row.title), ["Third " + suffix, "Second " + suffix, "First " + suffix]);
      assert.deepEqual(Object.keys(page.notifications[0]!).sort(), ["createdAt", "eventType", "id", "occurredAt", "taskId", "title"]);
      assert.deepEqual(await list(owner.token), { notifications: [], nextCursor: null });
      assert.deepEqual((await list(other.token)).notifications.map(row => row.title), ["Other " + suffix]);
    });
    await context.test("pagination stays stable across new deliveries and foreign cursors never widen access", async () => {
      const first = await list(recipient.token, "?limit=2");
      assert.ok(first.nextCursor);
      await create("New " + suffix, recipient.id);
      const second = await list(recipient.token, "?limit=2&before=" + first.nextCursor);
      assert.deepEqual(second.notifications.map(row => row.taskId), [taskId]);
      assert.equal(second.nextCursor, null);
      const foreign = (await list(other.token)).notifications[0]!.id;
      assert.ok((await list(recipient.token, "?before=" + foreign)).notifications.every(row => row.title !== "Other " + suffix));
      assert.equal((await list(recipient.token, "?limit=1")).notifications[0]?.title, "New " + suffix);
    });
    await context.test("missing, forged and deleted-user credentials cannot read saved notifications", async () => {
      const removed = await account("apiremoved");
      await create("Removed " + suffix, removed.id);
      await stack.query("user-service", "DELETE FROM users WHERE id = $1", [removed.id]);
      const parts = recipient.token.split("."); parts[2] = (parts[2]![0] === "A" ? "B" : "A") + parts[2]!.slice(1);
      for (const token of ["", "invalid", parts.join("."), removed.token]) {
        const response = await request(notificationUrl + "/api/notifications", { headers: { Authorization: "Bearer " + token } });
        assert.equal(response.status, 401); assert.equal(response.headers.get("www-authenticate"), "Bearer"); await response.arrayBuffer();
      }
      for (const query of ["recipientUserId=" + other.id, "limit=101", "before=2147483648"]) {
        const response = await request(notificationUrl + "/api/notifications?" + query, { headers: { Authorization: "Bearer " + recipient.token } });
        assert.equal(response.status, 400); await response.arrayBuffer();
      }
    });
    await context.test("User Service outage blocks reads but not background notification processing", async () => {
      await stack.control("stop", "user-service");
      try {
        const response = await request(notificationUrl + "/api/notifications", { headers: { Authorization: "Bearer " + recipient.token } });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { message: "User Service is unavailable. Please try again later." });
        const eventId = randomUUID();
        await stack.publish({ eventId, version: 1, type: "task.assigned", occurredAt: new Date().toISOString(),
          data: { taskId, recipientUserId: recipient.id, title: "During login outage " + suffix } });
        await waitFor(async () => (await stack.query("notification-service", "SELECT event_id FROM notifications WHERE event_id = $1", [eventId])).length === 1, "processing without User Service");
        assert.equal(await stack.health("notification-service"), 200);
      } finally { await stack.control("start", "user-service"); }
      await waitFor(async () => await stack.health("user-service") === 200, "User Service recovery");
      userUrl = await stack.url("user-service");
      assert.equal((await list(recipient.token)).notifications[0]?.title, "During login outage " + suffix);
    });
    await context.test("broker outage does not hide notifications that are already stored", async () => {
      const before = await list(recipient.token);
      await stack.control("stop", "rabbitmq");
      try {
        await waitFor(async () => await stack.health("notification-service") === 503, "broker readiness failure");
        assert.deepEqual(await list(recipient.token), before);
      } finally { await stack.control("start", "rabbitmq"); }
      await waitFor(async () => await stack.health("notification-service") === 200, "broker recovery");
    });
    await context.test("database outage returns a safe error and reads recover afterward", async () => {
      await stack.control("stop", "notification-db");
      try {
        const response = await request(notificationUrl + "/api/notifications", { headers: { Authorization: "Bearer " + recipient.token } });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { message: "Internal server error." });
      } finally { await stack.control("start", "notification-db"); }
      await waitFor(async () => await stack.health("notification-service") === 200, "notification storage recovery");
      assert.ok((await list(recipient.token)).notifications.length > 0);
    });
    await context.test("notification IDs and contents survive service and database restarts", async () => {
      const before = await list(recipient.token);
      await stack.control("restart", "notification-service");
      await waitFor(async () => await stack.health("notification-service") === 200, "service restart before database restart");
      await stack.control("restart", "notification-db");
      await waitFor(async () => await stack.health("notification-service") === 200, "notification restart");
      notificationUrl = await stack.url("notification-service");
      assert.deepEqual(await list(recipient.token), before);
    });
  } finally {
    for (const service of ["user-service", "rabbitmq", "notification-db", "notification-service"]) await stack.control("start", service);
  }
});
