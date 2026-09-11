import assert from "node:assert/strict";
import test from "node:test";

import createApp from "../src/app";
import AuthController from "../src/controllers/AuthController";
import HealthController from "../src/controllers/HealthController";
import ProfileController from "../src/controllers/ProfileController";
import { ValidationError } from "../src/errors/ValidationError";
import UserMapper from "../src/mappers/UserMapper";
import UserResponseMapper from "../src/mappers/UserResponseMapper";
import User from "../src/models/domain/User";
import UserCredentials from "../src/models/domain/UserCredentials";
import { LoginRequestDto } from "../src/models/dto/requests/LoginRequestDto";
import { RegisterRequestDto } from "../src/models/dto/requests/RegisterRequestDto";
import RequestValidator from "../src/utils/RequestValidator";
import unusedAuth from "./testAuth";
import withServer from "./testServer";

const input = { username: "demo", email: "demo@example.com", password: "test-only-password" };

test("controller handlers are regular prototype methods", () => {
  const auth = new AuthController({ register: async () => { throw new Error("Unused."); } }, unusedAuth.authentication);
  const profile = new ProfileController(unusedAuth.authentication);
  const health = new HealthController(async () => undefined, { error: () => undefined });
  for (const [instance, method] of [[auth, "register"], [auth, "login"], [profile, "getProfile"], [health, "check"]] as const) {
    assert.equal(Object.hasOwn(instance, method), false);
    assert.equal(typeof Object.getPrototypeOf(instance)[method], "function");
  }
});

test("domain instances retain all explicitly assigned fields", () => {
  const createdAt = new Date("2026-09-11T12:00:00Z");
  const user = new User(1, input.username, input.email, "member", createdAt);
  assert.deepEqual({ ...user }, { id: 1, username: input.username, email: input.email, role: "member", createdAt });
  assert.deepEqual({ ...new UserCredentials(1, "member", "test-only-hash") }, { id: 1, role: "member", passwordHash: "test-only-hash" });
});

test("controllers pass transformed DTO instances to services", async () => {
  let registrations = 0;
  let logins = 0;
  const user = new User(1, input.username, input.email, "member", new Date("2026-09-07T12:00:00Z"));
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: {
      register: async (dto) => {
        assert.ok(dto instanceof RegisterRequestDto);
        assert.deepEqual({ ...dto }, input);
        registrations++;
        return user;
      },
    },
    authentication: {
      ...unusedAuth.authentication,
      login: async (dto) => {
        assert.ok(dto instanceof LoginRequestDto);
        assert.deepEqual({ ...dto }, { email: input.email, password: input.password });
        logins++;
        return { token: "test-only-token" };
      },
    },
  });

  await withServer(app, async (baseUrl) => {
    for (const [path, body, status] of [
      ["register", { ...input, username: "  demo  ", email: "  DEMO@EXAMPLE.COM  " }, 201],
      ["login", { email: "  DEMO@EXAMPLE.COM  ", password: input.password }, 200],
    ] as const) {
      const response = await fetch(baseUrl + "/api/auth/" + path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      assert.equal(response.status, status);
      await response.arrayBuffer();
    }
  });
  assert.equal(registrations, 1);
  assert.equal(logins, 1);
});

test("validation rejects extra fields including prototype-sensitive keys", async () => {
  for (const key of ["role", "id", "extraFieldsMessage", "constructor", "__proto__", "prototype", "toString"]) {
    const body = JSON.parse(JSON.stringify({ ...input, [key]: { admin: true } }));
    await assert.rejects(RequestValidator.validate(RegisterRequestDto, body), {
      name: "ValidationError", message: RegisterRequestDto.extraFieldsMessage,
    });
  }
  await assert.rejects(RequestValidator.validate(LoginRequestDto, { ...input }), {
    name: "ValidationError", message: LoginRequestDto.extraFieldsMessage,
  });
  assert.equal(Object.hasOwn(Object.prototype, "admin"), false);
});

test("validation preserves field errors and does not coerce strings", async () => {
  const cases: [unknown, string][] = [
    [null, "Request data must be an object."],
    [{}, "Username is required."],
    [{ ...input, username: 42 }, "Username is required."],
    [{ ...input, username: "bad\u0000name" }, "Username must contain at most 50 characters and no control characters."],
    [{ ...input, email: false }, "A valid email address is required."],
    [{ ...input, email: "invalid" }, "A valid email address of at most 255 characters is required."],
    [{ ...input, password: 12345678 }, "Password must contain at least 8 characters."],
    [{ ...input, password: "😀".repeat(7) }, "Password must contain at least 8 characters."],
    [{ ...input, password: "😀".repeat(19) }, "Password must contain at most 72 UTF-8 bytes."],
  ];
  for (const [body, message] of cases) {
    await assert.rejects(RequestValidator.validate(RegisterRequestDto, body), { name: "ValidationError", message });
  }
  for (const key of ["username", "email", "password"]) {
    for (const value of [[], {}, ["value"], { constructor: { name: "String" } }]) {
      await assert.rejects(RequestValidator.validate(RegisterRequestDto, { ...input, [key]: value }), ValidationError);
    }
  }
});

test("validation counts Unicode characters separately from UTF-8 password bytes", async () => {
  const dto = await RequestValidator.validate(RegisterRequestDto, {
    ...input, username: "😀".repeat(50), password: "😀".repeat(8),
  });
  assert.equal(Array.from(dto.username).length, 50);
  assert.equal(Buffer.byteLength(dto.password), 32);
  await assert.rejects(RequestValidator.validate(RegisterRequestDto, {
    ...input, username: "😀".repeat(51),
  }), ValidationError);
  const boundary = await RequestValidator.validate(RegisterRequestDto, { ...input, password: "é".repeat(36) });
  assert.equal(Buffer.byteLength(boundary.password), 72);
  await assert.rejects(RequestValidator.validate(RegisterRequestDto, { ...input, password: "é".repeat(37) }), ValidationError);
});

test("malformed nested input returns 400 rather than a transformer error", async () => {
  let calls = 0;
  const app = createApp({
    ...unusedAuth,
    checkDatabase: async () => undefined,
    registration: { register: async () => { calls++; throw new Error("Unexpected registration."); } },
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, username: { constructor: { name: "String" } } }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Request data must contain valid field values." });
  });
  assert.equal(calls, 0);
});

test("database mappers return domain objects without HTTP field formatting", () => {
  const createdAt = new Date("2026-09-07T12:00:00Z");
  const user = UserMapper.fromDatabase({
    id: 1, username: input.username, email: input.email, role: "member", created_at: createdAt,
  });
  assert.ok(user instanceof User);
  assert.equal(user.createdAt, createdAt);
  assert.equal("created_at" in user, false);
  assert.equal("passwordHash" in user, false);

  const credentials = UserMapper.credentialsFromDatabase({ id: 1, role: "member", password_hash: "test-only-hash" });
  assert.ok(credentials instanceof UserCredentials);
  assert.equal(credentials.passwordHash, "test-only-hash");
  assert.deepEqual(Object.keys(credentials).sort(), ["id", "passwordHash", "role"]);
});

test("response mapping exposes only the public contract even if internal fields are added", () => {
  const user = Object.assign(new User(1, input.username, input.email, "member", new Date("2026-09-07T12:00:00Z")), {
    passwordHash: "test-only-hash", internalFlag: true,
  });
  assert.deepEqual(UserResponseMapper.toPublicResponse(user), {
    id: 1, username: input.username, email: input.email, role: "member", created_at: "2026-09-07T12:00:00.000Z",
  });
});
