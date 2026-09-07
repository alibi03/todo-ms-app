import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";

import createApp from "../src/app";
import AuthenticationService from "../src/services/AuthenticationService";
import { AuthenticationError } from "../src/errors/ApplicationErrors";
import User from "../src/models/domain/User";
import type UserCredentials from "../src/models/domain/UserCredentials";
import UserResponseMapper from "../src/mappers/UserResponseMapper";
import { LoginRequestDto } from "../src/models/requests/AuthRequests";
import RequestValidator from "../src/utils/RequestValidator";
import TokenService from "../src/services/TokenService";
import type { UserReader } from "../src/ports/RepositoryPorts";
import unusedAuth from "./testAuth";
import withServer from "./testServer";

const input = { email: "demo@example.com", password: "  Example-test-password-123!  " };
const user = new User(42, "demo", input.email, "member", new Date("2026-09-07T12:00:00.000Z"));
const tokens = new TokenService("test-only-jwt-secret-not-for-deployment");
const passwordHash = bcrypt.hash(input.password, 12);
const dummyHash = bcrypt.hash("test-only-dummy-password", 12);
const invalidBodies: unknown[] = [
  undefined, null, [], "text", 123, {},
  { ...input, email: null }, { ...input, email: "invalid" },
  { ...input, email: "a".repeat(250) + "@example.com" },
  { ...input, password: "" }, { ...input, password: false },
  { ...input, password: "a".repeat(73) }, { ...input, password: "😀".repeat(19) },
  { ...input, role: "admin" }, { ...input, userId: 1 },
];

function post(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(baseUrl + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function makeApp(authentication: Pick<AuthenticationService, "login" | "getProfile">) {
  return createApp({
    checkDatabase: async () => undefined,
    registration: { register: async () => user },
    authentication,
    tokens,
  }, { error: () => undefined });
}

test("login normalizes email but does not trim or impose a new minimum on passwords", async () => {
  assert.deepEqual({ ...await RequestValidator.validate(LoginRequestDto, { ...input, email: "  Demo@Example.COM  " }) }, input);
  assert.equal((await RequestValidator.validate(LoginRequestDto, { ...input, password: "x" })).password, "x");
  assert.equal((await RequestValidator.validate(LoginRequestDto, { ...input, password: "a".repeat(72) })).password.length, 72);
  assert.equal((await RequestValidator.validate(LoginRequestDto, { ...input, password: "😀".repeat(18) })).password, "😀".repeat(18));
});

test("invalid login bodies never reach storage or token creation", async () => {
  let reads = 0;
  const authentication = new AuthenticationService({
    findByEmail: async () => { reads++; return null; }, findById: async () => null,
  }, { create: () => { throw new Error("Unexpected token creation."); } }, await dummyHash);

  await withServer(makeApp(authentication), async (baseUrl) => {
    for (const body of invalidBodies) {
      const response = await post(baseUrl, body);
      assert.equal(response.status, 400);
      await response.arrayBuffer();
    }
  });
  assert.equal(reads, 0);
});

test("login checks bcrypt and returns only a signed token", async () => {
  const users: UserReader = {
    findByEmail: async (email) => {
      assert.equal(email, input.email);
      return { id: user.id, role: user.role, passwordHash: await passwordHash };
    },
    findById: async () => user,
  };
  const authentication = new AuthenticationService(users, tokens, await dummyHash);

  await withServer(makeApp(authentication), async (baseUrl) => {
    const response = await post(baseUrl, { ...input, email: "  Demo@Example.COM  " });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json() as { token: string };
    assert.deepEqual(Object.keys(body), ["token"]);
    assert.deepEqual({ ...tokens.verify(body.token) }, { id: user.id, role: user.role });
    assert.equal(JSON.stringify(body).includes(await passwordHash), false);
  });
});

test("wrong password and unknown email return the same 401 and never issue tokens", async () => {
  let stored: UserCredentials | null = { id: user.id, role: user.role, passwordHash: await passwordHash };
  let issued = 0;
  const authentication = new AuthenticationService({
    findByEmail: async () => stored, findById: async () => user,
  }, { create: () => { issued++; return "unexpected"; } }, await dummyHash);

  await withServer(makeApp(authentication), async (baseUrl) => {
    for (const missing of [false, true]) {
      if (missing) stored = null;
      const response = await post(baseUrl, { ...input, password: "wrong-password" });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: "Invalid email or password." });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });
  assert.equal(issued, 0);
});

test("profile uses the verified subject and returns current database fields", async () => {
  const current = { ...user, username: "updated", role: "admin" as const };
  const authentication = new AuthenticationService({
    findByEmail: async () => null,
    findById: async (id) => { assert.equal(id, user.id); return current; },
  }, tokens, await dummyHash);

  await withServer(makeApp(authentication), async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/profile?userId=1&role=admin", {
      headers: { Authorization: "bearer " + tokens.create(user) },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { user: UserResponseMapper.toPublicResponse(current) });
  });
});

test("missing, malformed and tampered credentials cannot read a profile", async () => {
  let reads = 0;
  const app = makeApp({ ...unusedAuth.authentication, getProfile: async () => { reads++; return user; } });
  const valid = tokens.create(user);
  const headers = [undefined, "Basic abc", "Bearer", "Bearer a b", "Bearer " + "a".repeat(4097), "Bearer invalid", "Bearer " + valid + "x"];

  await withServer(app, async (baseUrl) => {
    for (const authorization of headers) {
      const response = await fetch(baseUrl + "/api/profile?token=" + valid, {
        headers: authorization ? { Authorization: authorization } : {},
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.equal(response.headers.get("cache-control"), "no-store");
      await response.arrayBuffer();
    }
  });
  assert.equal(reads, 0);
});

test("a deleted user's token no longer loads a profile", async () => {
  const authentication = new AuthenticationService({
    findByEmail: async () => null, findById: async () => null,
  }, tokens, await dummyHash);

  await withServer(makeApp(authentication), async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/profile", { headers: { Authorization: "Bearer " + tokens.create(user) } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "User is no longer available." });
  });
});

test("login limits do not share counters with registration or block health", async () => {
  let calls = 0;
  const app = makeApp({ ...unusedAuth.authentication, login: async () => { calls++; throw new AuthenticationError("Invalid email or password."); } });

  await withServer(app, async (baseUrl) => {
    for (let i = 0; i < 20; i++) {
      const response = await post(baseUrl, input);
      assert.equal(response.status, 401);
      await response.arrayBuffer();
    }
    const limited = await post(baseUrl, input);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
    assert.deepEqual(await limited.json(), { message: "Too many login attempts. Please try again later." });
    const register = await fetch(baseUrl + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, username: "demo" }),
    });
    assert.equal(register.status, 201);
    await register.arrayBuffer();
    const health = await fetch(baseUrl + "/api/health");
    assert.equal(health.status, 200);
    await health.arrayBuffer();
  });
  assert.equal(calls, 20);
});

test("login and profile failures do not expose credentials in responses or logs", async () => {
  const logged: unknown[] = [];
  const fail = async (): Promise<never> => { throw new Error("test-only-sensitive-details"); };
  const app = createApp({
    checkDatabase: async () => undefined, registration: { register: fail },
    authentication: { login: fail, getProfile: fail }, tokens,
  }, { error: (...args) => { logged.push(args); } });

  await withServer(app, async (baseUrl) => {
    const responses = [
      await post(baseUrl, input),
      await fetch(baseUrl + "/api/profile", { headers: { Authorization: "Bearer " + tokens.create(user) } }),
    ];
    for (const response of responses) {
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { message: "Internal server error." });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });
  assert.equal(logged.length, 2);
  assert.equal(JSON.stringify(logged).includes("test-only-sensitive-details"), false);
});
