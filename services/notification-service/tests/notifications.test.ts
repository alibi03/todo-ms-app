import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config/environment";
import { NotificationController } from "../src/controllers/NotificationController";
import { AuthenticationError } from "../src/errors/AuthenticationError";
import { DependencyUnavailableError } from "../src/errors/DependencyUnavailableError";
import { ValidationError } from "../src/errors/ValidationError";
import { NotificationMapper } from "../src/mappers/NotificationMapper";
import { NotificationResponseMapper } from "../src/mappers/NotificationResponseMapper";
import { AuthenticatedUser } from "../src/models/domain/AuthenticatedUser";
import { Notification } from "../src/models/domain/Notification";
import { ListNotificationsQueryDto } from "../src/models/dto/requests/ListNotificationsQueryDto";
import { NotificationService } from "../src/services/NotificationService";
import withServer from "./testServer";

function fixture() {
  const rows = Array.from({ length: 25 }, (_, index) => ({ recipient: index % 2 + 1,
    notification: new Notification({ id: index + 1, eventType: "task.assigned", taskId: index + 100, title: "Task " + index,
      occurredAt: new Date("2026-09-19T10:00:00Z"), createdAt: new Date("2026-09-19T10:01:00Z") }) }));
  let reads = 0;
  let authCalls = 0;
  let storageFailure = false;
  const logs: unknown[] = [];
  const notificationService = new NotificationService({
    async createOnce() { assert.fail("Listing must not write notifications."); },
    async listByRecipient(userId, before, limit) {
      reads++;
      if (storageFailure) throw new Error("SELECT private table; password=private; token=private");
      return rows.filter(row => row.recipient === userId && (before === null || row.notification.id < before))
        .sort((a, b) => b.notification.id - a.notification.id).slice(0, limit).map(row => row.notification);
    },
  });
  const app = createApp({ notificationService,
    userServiceClient: { async getCurrentUser(token) {
      authCalls++;
      if (token === "unavailable") throw new DependencyUnavailableError("User Service is unavailable. Please try again later.");
      if (!["alice", "bob", "empty"].includes(token)) throw new AuthenticationError("Invalid or expired credentials.");
      return new AuthenticatedUser(token === "alice" ? 1 : token === "bob" ? 2 : 3);
    } }, checkDatabase: async () => undefined, isConsumerReady: () => true,
  }, { error(...args: unknown[]) { logs.push(args); } });
  return { app, rows, notificationService, logs, reads: () => reads, authCalls: () => authCalls, failStorage: () => { storageFailure = true; } };
}

async function list(base: string, query = "", token = "alice") {
  const response = await fetch(base + "/api/notifications" + query, { headers: { Authorization: "Bearer " + token } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return await response.json() as { notifications: { id: number; title: string }[]; nextCursor: number | null };
}

test("listing uses the authenticated recipient and returns only the public fields", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    const alice = await list(base);
    assert.deepEqual(alice.notifications.map(row => row.id), [25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);
    assert.equal(alice.nextCursor, null);
    assert.deepEqual(Object.keys(alice.notifications[0]!).sort(), ["createdAt", "eventType", "id", "occurredAt", "taskId", "title"]);
    const bob = await list(base, "", "bob");
    assert.ok(bob.notifications.every(row => row.id % 2 === 0));
    assert.deepEqual(await list(base, "", "empty"), { notifications: [], nextCursor: null });
  });
});

test("cursor pages are descending and do not repeat when newer notifications arrive", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    const first = await list(base, "?limit=2");
    assert.deepEqual(first.notifications.map(row => row.id), [25, 23]);
    assert.equal(first.nextCursor, 23);
    state.rows.push({ recipient: 1, notification: new Notification({ ...state.rows[0]!.notification, id: 26 }) });
    const second = await list(base, "?limit=2&before=" + first.nextCursor);
    assert.deepEqual(second.notifications.map(row => row.id), [21, 19]);
    assert.equal(second.nextCursor, 19);
    assert.equal((await list(base, "?limit=1")).notifications[0]?.id, 26);
    assert.deepEqual(await list(base, "?before=1"), { notifications: [], nextCursor: null });
    assert.equal((await list(base, "?before=4&limit=2")).nextCursor, null);
  });
});

test("default and maximum page sizes are bounded", async () => {
  const state = fixture();
  for (let id = 26; id <= 160; id++) state.rows.push({ recipient: 1, notification: new Notification({ ...state.rows[0]!.notification, id }) });
  await withServer(state.app, async base => {
    assert.equal((await list(base)).notifications.length, 20);
    assert.equal((await list(base, "?limit=100")).notifications.length, 100);
    assert.equal((await list(base, "?limit=1")).notifications.length, 1);
  });
});

test("invalid pagination and recipient overrides are rejected before repository access", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    for (const query of ["limit=0", "limit=101", "limit=-1", "limit=1.5", "limit=1e2", "limit=01", "limit=", "limit=1&limit=2",
      "limit[]=1", "before=0", "before=-1", "before=2147483648", "before=99999999999", "before=1.1", "before=1e2", "before=",
      "before=01", "before=1&before=2", "before[]=1", "recipientUserId=2", "userId=2", "owner=2", "after=1", "constructor=x", "__proto__=x"]) {
      const response = await fetch(base + "/api/notifications?" + query, { headers: { Authorization: "Bearer alice" } });
      assert.equal(response.status, 400, query);
      assert.equal(response.headers.get("cache-control"), "no-store");
      await response.arrayBuffer();
    }
  });
  assert.equal(state.reads(), 0);
});

test("a foreign cursor or spoofed identity header does not change the recipient", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    const response = await fetch(base + "/api/notifications?before=24", {
      headers: { Authorization: "Bearer alice", "X-User-Id": "2", Cookie: "userId=2" },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { notifications: { id: number }[] };
    assert.ok(body.notifications.every(row => row.id % 2 === 1 && row.id < 24));
  });
});

test("missing, malformed and oversized credentials never call authentication or storage", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    for (const value of ["", "Basic alice", "Bearer", "Bearer alice bob", "Bearer " + "x".repeat(4097)]) {
      const response = await fetch(base + "/api/notifications", { headers: { Authorization: value } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      await response.arrayBuffer();
    }
  });
  assert.equal(state.authCalls(), 0); assert.equal(state.reads(), 0);
});

test("invalid credentials and unavailable User Service fail closed", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    for (const [token, status] of [["invalid", 401], ["unavailable", 503]] as const) {
      const response = await fetch(base + "/api/notifications", { headers: { Authorization: "Bearer " + token } });
      assert.equal(response.status, status); await response.arrayBuffer();
    }
  });
  assert.equal(state.reads(), 0);
});

test("storage errors hide SQL and credentials from responses and logs", async () => {
  const state = fixture(); state.failStorage();
  await withServer(state.app, async base => {
    const response = await fetch(base + "/api/notifications", { headers: { Authorization: "Bearer alice" } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "Internal server error." });
  });
  assert.equal(JSON.stringify(state.logs).includes("private"), false);
  assert.deepEqual(state.logs, [["Notification request failed.", { name: "Error" }]]);
});

test("notification rate limiting does not block health checks", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    for (let index = 0; index < 120; index++) {
      const response = await fetch(base + "/api/notifications"); assert.equal(response.status, 401); await response.arrayBuffer();
    }
    const blocked = await fetch(base + "/api/notifications");
    assert.equal(blocked.status, 429); assert.ok(blocked.headers.get("retry-after")); await blocked.arrayBuffer();
    assert.equal((await fetch(base + "/api/health")).status, 200);
  });
});

test("listing remains read-only and does not expose detail or write routes", async () => {
  const state = fixture();
  await withServer(state.app, async base => {
    for (const [method, path] of [["POST", ""], ["PATCH", "/1"], ["DELETE", "/1"], ["GET", "/1"]]) {
      const response = await fetch(base + "/api/notifications" + path, { method, headers: { Authorization: "Bearer alice" } });
      assert.equal(response.status, 404); await response.arrayBuffer();
    }
  });
  assert.equal(state.reads(), 0);
});

test("service rejects invalid numeric bounds when called without a controller", async () => {
  const state = fixture();
  for (const query of [{ limit: "0" }, { limit: "101" }, { limit: "1.5" }, { before: "0" }, { before: "2147483648" }, { before: "NaN" }]) {
    await assert.rejects(state.notificationService.list(1, query), ValidationError);
  }
  for (const id of [0, -1, 1.5, NaN, 2147483648]) await assert.rejects(state.notificationService.list(id, {}), ValidationError);
  assert.equal(state.reads(), 0);
});

test("controller uses a normal bound method and passes validated query DTOs", async () => {
  assert.equal(Object.hasOwn(NotificationController.prototype, "list"), true);
  const app = createApp({
    notificationService: { async process() {}, async list(userId, query) {
      assert.equal(userId, 7); assert.ok(query instanceof ListNotificationsQueryDto);
      assert.equal(query.limit, "2"); return { notifications: [], nextCursor: null };
    } }, userServiceClient: { async getCurrentUser() { return new AuthenticatedUser(7); } },
    checkDatabase: async () => undefined, isConsumerReady: () => true,
  });
  await withServer(app, async base => { await list(base, "?limit=2"); });
});

test("mappers retain domain fields and exclude unrelated internal properties", () => {
  const date = new Date("2026-09-19T12:00:00Z");
  const row = { id: 1, event_type: "task.reassigned" as const, task_id: 2, title: "Task", occurred_at: date, created_at: date,
    event_id: "internal", recipient_user_id: 123, password: "private" };
  const notification = NotificationMapper.toDomain(row);
  assert.ok(notification instanceof Notification);
  assert.deepEqual({ ...notification }, { id: 1, eventType: "task.reassigned", taskId: 2, title: "Task", occurredAt: date, createdAt: date });
  const response = NotificationResponseMapper.toResponse(Object.assign(notification, { private: "secret" }));
  assert.deepEqual(response, { id: 1, eventType: "task.reassigned", taskId: 2, title: "Task", occurredAt: date.toISOString(), createdAt: date.toISOString() });
});

test("REST configuration requires a safe origin and bounded timeout without JWT credentials", () => {
  const env = { DB_HOST: "notification-db", DB_NAME: "notifications", DB_USER: "notification", DB_PASSWORD: "test-only", USER_SERVICE_URL: "http://user-service:3000" };
  assert.equal(loadConfig(env).userServiceTimeoutMs, 3000);
  assert.equal(loadConfig(env).userServiceUrl, env.USER_SERVICE_URL);
  for (const url of ["", "invalid", "file:///tmp/test", "http://secret:password@user-service", "http://user-service/api", "http://user-service?x=1", "http://user-service#x"]) {
    assert.throws(() => loadConfig({ ...env, USER_SERVICE_URL: url }), error => {
      assert.equal((error as Error).message.includes("password"), false); return true;
    });
  }
  for (const timeout of ["", "0", "10001", "1.5", "1e3"]) assert.throws(() => loadConfig({ ...env, USER_SERVICE_TIMEOUT_MS: timeout }));
  assert.equal(loadConfig({ ...env, USER_SERVICE_TIMEOUT_MS: "10000" }).userServiceTimeoutMs, 10000);
});
