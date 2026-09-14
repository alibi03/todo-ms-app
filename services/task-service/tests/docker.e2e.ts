import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

const userUrl = process.env.E2E_USER_URL;
const taskUrl = process.env.E2E_TASK_URL;

test("real User and Task services communicate across Docker", async context => {
  assert.equal(process.env.E2E_DISPOSABLE, "true", "Run only against disposable service instances.");
  assert.ok(userUrl && taskUrl);
  const suffix = randomBytes(5).toString("hex");
  async function account(label: string) {
    const email = label + suffix + "@example.test";
    const password = "Test-only-" + randomBytes(12).toString("hex");
    const registered = await fetch(userUrl + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: label + suffix, email, password }),
    });
    assert.equal(registered.status, 201);
    const { user } = await registered.json();
    const loggedIn = await fetch(userUrl + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    assert.equal(loggedIn.status, 200);
    const { token } = await loggedIn.json();
    return { id: user.id as number, token: token as string };
  }
  const alice = await account("alice");
  const bob = await account("bob");
  async function create(token: string, body: unknown) {
    return fetch(taskUrl + "/api/tasks", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function list(token: string, query = "") {
    const response = await fetch(taskUrl + "/api/tasks" + query, { headers: { Authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    return response.json();
  }
  await context.test("registered users can create tasks with their verified owner IDs", async () => {
    const response = await create(alice.token, { title: "Alice task" });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).task.ownerUserId, alice.id);
    assert.equal((await create(bob.token, { title: "Bob task" })).status, 201);
  });
  await context.test("each user can list only their own tasks", async () => {
    assert.deepEqual((await list(alice.token)).tasks.map((task: { title: string }) => task.title), ["Alice task"]);
    assert.deepEqual((await list(bob.token)).tasks.map((task: { title: string }) => task.title), ["Bob task"]);
  });
  await context.test("tampered JWTs are rejected through the real User Service", async () => {
    const parts = alice.token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: String(bob.id), role: "admin" })).toString("base64url");
    assert.equal((await create(parts.join("."), { title: "Forbidden" })).status, 401);
    assert.equal((await fetch(taskUrl + "/api/tasks")).status, 401);
  });
  await context.test("body and query ownership overrides cannot expose another user's tasks", async () => {
    assert.equal((await create(alice.token, { title: "Forbidden", ownerUserId: bob.id })).status, 400);
    const response = await fetch(taskUrl + "/api/tasks?ownerUserId=" + String(bob.id), {
      headers: { Authorization: "Bearer " + alice.token },
    });
    assert.equal(response.status, 400);
    assert.equal((await list(alice.token)).tasks.length, 1);
  });
  await context.test("cursor pagination works through both real services", async () => {
    assert.equal((await create(alice.token, { title: "Alice second" })).status, 201);
    const first = await list(alice.token, "?limit=1");
    assert.ok(first.nextCursor);
    const next = await list(alice.token, "?limit=1&after=" + String(first.nextCursor));
    assert.equal(next.tasks[0].title, "Alice second");
    assert.equal(next.nextCursor, null);
  });
});
