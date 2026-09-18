import assert from "node:assert/strict";
import test from "node:test";
import createApp from "../src/app";
import { UserLookupController } from "../src/controllers/UserLookupController";
import { User } from "../src/models/domain/User";
import { TokenService } from "../src/services/TokenService";
import { UserLookupService } from "../src/services/UserLookupService";
import unusedAuth from "./testAuth";
import unusedRepository from "./testRepository";
import withServer from "./testServer";

function fixture() {
  const users = new Map([1, 2].map(id => [id, new User(id, "user" + id, "user" + id + "@example.test", "member", new Date())]));
  const repository = { ...unusedRepository, async findById(id: number) { return users.get(id) ?? null; } };
  const service = new UserLookupService(repository);
  const tokens = new TokenService("test-only-user-lookup-secret-not-for-deployment");
  const token = tokens.create(users.get(1)!);
  const logs: unknown[][] = [];
  const app = createApp({
    ...unusedAuth, tokens, userLookup: service, checkDatabase: async () => undefined,
    registration: { async register() { throw new Error("Unexpected registration."); } },
  }, { error: (...args) => { logs.push(args); } });
  return { app, users, service, repository, token, logs };
}

function get(base: string, id: string | number, token?: string) {
  return fetch(base + "/api/users/" + String(id), { headers: token ? { Authorization: "Bearer " + token } : {} });
}

test("authenticated user lookup returns only the target ID with no cache", async () => {
  const { app, token, service } = fixture();
  assert.equal(Object.hasOwn(new UserLookupController(service), "getUser"), false);
  await withServer(app, async base => {
    for (const id of [1, 2]) {
      const response = await get(base, id, token);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { user: { id } });
    }
  });
});

test("user lookup requires valid credentials and a still-existing caller", async () => {
  const { app, token, users } = fixture();
  await withServer(app, async base => {
    assert.equal((await get(base, 2)).status, 401);
    assert.equal((await get(base, 2, "invalid")).status, 401);
    users.delete(1);
    assert.equal((await get(base, 2, token)).status, 401);
    assert.equal((await get(base, 999, token)).status, 401);
  });
});

test("missing users return 404 and invalid IDs never become database parameters", async () => {
  const { app, token } = fixture();
  await withServer(app, async base => {
    const missing = await get(base, 999, token);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { message: "User not found." });
    for (const id of [0, -1, 1.5, "2x", "01", "2147483648", "1e2", "1%20OR%201=1"]) {
      assert.equal((await get(base, id, token)).status, 400, String(id));
    }
  });
});

test("lookup failures do not disclose database details", async () => {
  const { app, token, repository, logs } = fixture();
  repository.findById = async () => { throw new Error("private SQL password=secret"); };
  await withServer(app, async base => {
    const response = await get(base, 2, token);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "Internal server error." });
  });
  assert.equal(/private|SQL|password|secret/.test(JSON.stringify(logs)), false);
});

test("lookup rate limiting does not block health checks", async () => {
  const { app, token } = fixture();
  await withServer(app, async base => {
    for (let index = 0; index < 120; index++) assert.equal((await get(base, 2, token)).status, 200);
    assert.equal((await get(base, 2, token)).status, 429);
    assert.equal((await fetch(base + "/api/health")).status, 200);
  });
});
