import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";

import createApp from "../src/app";
import { ConflictError } from "../src/errors/ConflictError";
import { ValidationError } from "../src/errors/ValidationError";
import User from "../src/models/domain/User";
import { RegisterRequestDto } from "../src/models/dto/requests/RegisterRequestDto";
import { CreateUserModel } from "../src/models/domain/CreateUserModel";
import type { PublicUserResponse } from "../src/models/dto/responses/PublicUserResponse";
import RegistrationService from "../src/services/RegistrationService";
import RequestValidator from "../src/utils/RequestValidator";
import withServer from "./testServer";
import unusedAuth from "./testAuth";
import unusedRepository from "./testRepository";

const validInput = {
  username: "demo_user",
  email: "demo@example.com",
  password: "Example-test-password-123!",
};

const publicUser: PublicUserResponse = {
  id: 1,
  username: validInput.username,
  email: validInput.email,
  role: "member",
  created_at: "2026-09-06T12:00:00.000Z",
};
const user = new User(1, validInput.username, validInput.email, "member", new Date(publicUser.created_at));

const invalidBodies: unknown[] = [
  undefined, null, [], "text", 10, {},
  { ...validInput, username: "   " },
  { ...validInput, username: 123 },
  { ...validInput, username: "a".repeat(51) },
  { ...validInput, username: "bad\u0000name" },
  { ...validInput, email: "invalid-email" },
  { ...validInput, email: "a".repeat(250) + "@example.com" },
  { ...validInput, email: false },
  { ...validInput, password: "short" },
  { ...validInput, password: null },
  { ...validInput, password: "a".repeat(73) },
  { ...validInput, password: "😀".repeat(19) },
  { ...validInput, role: "admin" },
  { ...validInput, id: 123 },
];

function post(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(baseUrl + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("registration trims identity fields, lowercases email, and preserves the password", async () => {
  const input = await RequestValidator.validate(RegisterRequestDto, {
    username: "  demo_user  ",
    email: "  Demo@Example.COM  ",
    password: "  Example-test-password-123!  ",
  });

  assert.equal(input.username, "demo_user");
  assert.equal(input.email, "demo@example.com");
  assert.equal(input.password, "  Example-test-password-123!  ");
});

test("registration rejects invalid bodies and privilege-related extra fields", async () => {
  for (const body of invalidBodies) {
    await assert.rejects(RequestValidator.validate(RegisterRequestDto, body), ValidationError);
  }
});

test("registration accepts password and username boundaries without truncation", async () => {
  const input = { ...validInput, username: "a".repeat(50), password: "a".repeat(72) };
  assert.deepEqual({ ...await RequestValidator.validate(RegisterRequestDto, input) }, input);
  assert.equal((await RequestValidator.validate(RegisterRequestDto, { ...validInput, password: "😀".repeat(18) })).password, "😀".repeat(18));
  assert.equal((await RequestValidator.validate(RegisterRequestDto, { ...validInput, password: "12345678" })).password, "12345678");
});

test("registration uses a new bcrypt salt at cost 12 and passes only the hash to storage", async () => {
  const saved: CreateUserModel[] = [];
  const service = new RegistrationService({ ...unusedRepository,
    create: async (model) => { saved.push(model); return user; },
  });

  const input = await RequestValidator.validate(RegisterRequestDto, validInput);
  assert.equal(await service.register(input), user);
  await service.register(input);
  assert.equal(saved.length, 2);
  const first = saved[0]!;
  assert.ok(first instanceof CreateUserModel);
  const second = saved[1]!;
  assert.equal("password" in first, false);
  assert.notEqual(first.passwordHash, validInput.password);
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(bcrypt.getRounds(first.passwordHash), 12);
  assert.equal(await bcrypt.compare(validInput.password, first.passwordHash), true);
});

test("invalid registrations are rejected before the service is called", async () => {
  let calls = 0;
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: { register: async () => { calls++; return user; } },
  });

  await withServer(app, async (baseUrl) => {
    for (const body of invalidBodies) {
      const response = await post(baseUrl, body);
      assert.equal(response.status, 400);
      await response.arrayBuffer();
    }
  });
  assert.equal(calls, 0);
});

test("registration HTTP response is 201 with the original public user contract", async () => {
  const registration = new RegistrationService({ ...unusedRepository, create: async () => user });
  const app = createApp({ ...unusedAuth, checkDatabase: async () => undefined, registration });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, validInput);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      message: "User registered successfully.",
      user: publicUser,
    });
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("invalid HTTP requests return 400 without inserting users", async () => {
  let writes = 0;
  const registration = new RegistrationService({ ...unusedRepository,
    create: async () => { writes++; return user; },
  });
  const app = createApp({ ...unusedAuth, checkDatabase: async () => undefined, registration });

  await withServer(app, async (baseUrl) => {
    for (const body of invalidBodies) {
      const response = await post(baseUrl, body);
      assert.equal(response.status, 400);
      const result = await response.text();
      assert.equal(result.includes(validInput.password), false);
    }
  });

  assert.equal(writes, 0);
});

test("duplicate HTTP requests return a generic conflict response", async () => {
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: { register: async () => { throw new ConflictError("Username or email already exists."); } },
  });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, validInput);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { message: "Username or email already exists." });
  });
});

test("malformed and oversized JSON return 400 and 413 without leaking the body", async () => {
  let calls = 0;
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: { register: async () => { calls++; return user; } },
  });

  await withServer(app, async (baseUrl) => {
    const malformed = await fetch(baseUrl + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"password":"private-test-value"',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { message: "Request body must be valid JSON." });

    const oversized = await post(baseUrl, { ...validInput, username: "x".repeat(21_000) });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { message: "Request body exceeds the 20kb limit." });
  });

  assert.equal(calls, 0);
});

test("unexpected failures hide database details from HTTP responses and logs", async () => {
  const logged: unknown[] = [];
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: { register: async () => { throw new Error("private-test-value: database connection details"); } },
  }, { error: (...args) => { logged.push(args); } });

  await withServer(app, async (baseUrl) => {
    const response = await post(baseUrl, validInput);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "Internal server error." });
  });

  assert.equal(logged.length, 1);
  assert.equal(JSON.stringify(logged).includes("private-test-value"), false);
});

test("registration is limited to 20 attempts per IP while health remains available", async () => {
  let calls = 0;
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: { register: async () => { calls++; throw new ValidationError("Invalid request."); } },
  });

  await withServer(app, async (baseUrl) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await post(baseUrl, validInput);
      assert.equal(response.status, 400);
      await response.arrayBuffer();
    }

    const limited = await post(baseUrl, {});
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
    assert.deepEqual(await limited.json(), { message: "Too many registration attempts. Please try again later." });
    const health = await fetch(baseUrl + "/api/health");
    assert.equal(health.status, 200);
    await health.arrayBuffer();
  });

  assert.equal(calls, 20);
});
