import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const directory = fileURLToPath(new URL("../", import.meta.url));
const databases = [
  ["user-db", "staj_user", "staj_users_test_notifications"],
  ["task-db", "staj_task", "staj_tasks_test_notifications"],
  ["notification-db", "staj_notification", "staj_notifications_test_notifications"],
];

test("the complete Docker stack recovers and preserves its data", { timeout: 240000 }, async context => {
  const project = process.env.E2E_PROJECT ?? "";
  assert.equal(process.env.E2E_DISPOSABLE, "true", "Only use a disposable test stack.");
  assert.match(project, /^staj-notification-test-web-[a-z0-9-]+$/);

  async function docker(args, timeout = 60000) {
    const { stdout } = await execute("docker", args, { cwd: directory, timeout });
    return stdout.trim();
  }
  async function compose(args, timeout) {
    return docker(["compose", "-p", project, "-f", "compose.yaml", "-f", "compose.test.yaml", ...args], timeout);
  }
  async function url(service) {
    const address = await compose(["port", service, service === "web" ? "8080" : "3000"]);
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    return "http://" + address;
  }
  async function state(service) {
    const id = await compose(["ps", "-a", "-q", service]);
    const label = await docker(["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', id]);
    assert.equal(label, project);
    return docker(["inspect", "--format", "{{.Id}} {{.State.Running}} {{.State.StartedAt}}", id]);
  }
  async function query([service, user, database], sql) {
    return compose(["exec", "-T", service, "psql", "-U", user, "-d", database, "-At", "-c", sql]);
  }
  async function request(base, path, options = {}) {
    return fetch(base + path, { ...options, signal: AbortSignal.timeout(12000) });
  }
  async function waitFor(check, label) {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try { if (await check()) return; } catch { /* A dependency may still be reconnecting. */ }
      await delay(300);
    }
    assert.fail("Timed out: " + label);
  }

  // Verify the actual databases before any container can be stopped.
  for (const database of databases) {
    assert.equal(await query(database, "SELECT current_database()"), database[2]);
    await state(database[0]);
  }

  try {
    await context.test("User Service survives a database outage without restarting", async () => {
      const userUrl = await url("user-service");
      assert.equal((await request(userUrl, "/api/health")).status, 200);
      const before = await state("user-service");
      assert.match(before, / true /);
      try {
        await compose(["stop", "user-db"]);
        assert.equal((await request(userUrl, "/api/health")).status, 503);
        assert.equal(await state("user-service"), before);
      } finally {
        await compose(["up", "-d", "--no-deps", "--wait", "user-db"]);
      }
      await waitFor(async () => (await request(userUrl, "/api/health")).status === 200, "User database recovery");
      assert.equal(await state("user-service"), before);
    });

    // Restore dependencies even when the first regression test fails.
    await compose(["up", "-d", "--wait", "--wait-timeout", "90"], 120000);
    await context.test("users, tasks, notifications and migration history survive container replacement", async () => {
      let webUrl = await url("web");
      const suffix = randomBytes(6).toString("hex");
      async function account(label) {
        const credentials = { email: label + suffix + "@example.test", password: "Test-only-" + randomBytes(16).toString("hex") };
        const registered = await request(webUrl, "/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...credentials, username: label + suffix }),
        });
        assert.equal(registered.status, 201);
        return { credentials, user: (await registered.json()).user };
      }
      async function login(account) {
        const response = await request(webUrl, "/api/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(account.credentials),
        });
        assert.equal(response.status, 200);
        return { Authorization: "Bearer " + (await response.json()).token };
      }
      async function get(path, headers) {
        const response = await request(webUrl, path, { headers });
        assert.equal(response.status, 200);
        return response.json();
      }
      const owner = await account("persistowner"), recipient = await account("persistrecipient");
      let ownerHeaders = await login(owner), recipientHeaders = await login(recipient);
      const created = await request(webUrl, "/api/tasks", {
        method: "POST", headers: { ...ownerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Persistence " + suffix, description: "Container replacement check", assignedToUserId: recipient.user.id, dueDate: "2030-12-31" }),
      });
      assert.equal(created.status, 201);
      const task = (await created.json()).task;
      await waitFor(async () => (await get("/api/notifications", recipientHeaders)).notifications.length === 1, "assignment delivery");
      const savedNotifications = await get("/api/notifications", recipientHeaders);
      const migrationSql = "SELECT name, run_on FROM pgmigrations ORDER BY name";
      const migrations = await Promise.all(databases.map(database => query(database, migrationSql)));
      const before = await state("user-service");
      const volumes = await docker(["volume", "ls", "-q", "--filter", "label=com.docker.compose.project=" + project]);
      assert.equal(volumes.split("\n").length, 4);

      await compose(["down"]); // Keep the volumes; replace containers, not their data.
      await compose(["up", "-d", "--wait", "--wait-timeout", "120"], 150000);
      assert.notEqual(await state("user-service"), before);
      assert.equal(await docker(["volume", "ls", "-q", "--filter", "label=com.docker.compose.project=" + project]), volumes);
      webUrl = await url("web");
      ownerHeaders = await login(owner);
      recipientHeaders = await login(recipient);
      assert.deepEqual((await get("/api/profile", ownerHeaders)).user, owner.user);
      assert.deepEqual((await get("/api/profile", recipientHeaders)).user, recipient.user);
      assert.deepEqual((await get("/api/tasks", ownerHeaders)).tasks, [task]);
      assert.deepEqual((await get("/api/tasks", recipientHeaders)).tasks, [task]);
      assert.deepEqual(await get("/api/notifications", recipientHeaders), savedNotifications);
      assert.deepEqual((await get("/api/notifications", ownerHeaders)).notifications, []);
      assert.deepEqual(await Promise.all(databases.map(database => query(database, migrationSql))), migrations);
    });
  } finally {
    await compose(["up", "-d", "--wait", "--wait-timeout", "120"], 150000);
  }
});
