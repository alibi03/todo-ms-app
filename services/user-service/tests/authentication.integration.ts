import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import createApp from "../src/app";
import AuthenticationService from "../src/authentication";
import { loadConfig } from "../src/config";
import UserDatabase from "../src/database";
import RegistrationService from "../src/registration";
import TokenService from "../src/token";
import UserRepository, { type PublicUser } from "../src/user-repository";
import withServer from "./test-server";

test("login and profile work with PostgreSQL", async (t) => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_users_test_[a-z0-9_]+$/, "Use a dedicated staj_users_test_* database.");
  const database = new UserDatabase(config.database);

  try {
    await database.migrate();
    const users = new UserRepository(database);
    const tokens = new TokenService(config.jwtSecret);
    const authentication = new AuthenticationService(users, tokens, await bcrypt.hash("test-only-dummy-password", 12));
    const app = createApp({
      checkDatabase: () => database.checkHealth(),
      registration: new RegistrationService(users), authentication, tokens,
    });
    const input = { username: "auth_integration", email: "auth-integration@example.com", password: "  Example-test-password-123!  " };
    let registered: PublicUser;
    let token: string;

    await withServer(app, async (baseUrl) => {
      const post = (path: string, body: unknown) => fetch(baseUrl + path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const profile = (value: string) => fetch(baseUrl + "/api/profile", {
        headers: { Authorization: "Bearer " + value },
      });

      await t.test("registered users can log in and load their own public profile", async () => {
        const registration = await post("/api/auth/register", input);
        assert.equal(registration.status, 201);
        registered = (await registration.json() as { user: PublicUser }).user;

        const login = await post("/api/auth/login", { email: "  AUTH-INTEGRATION@EXAMPLE.COM  ", password: input.password });
        assert.equal(login.status, 200);
        assert.equal(login.headers.get("cache-control"), "no-store");
        const body = await login.json() as { token: string };
        assert.deepEqual(Object.keys(body), ["token"]);
        token = body.token;
        assert.deepEqual(tokens.verify(token), { id: registered.id, role: "member" });

        const response = await profile(token);
        assert.equal(response.status, 200);
        const result = await response.json() as { user: PublicUser };
        assert.deepEqual(result, { user: registered });
        assert.deepEqual(Object.keys(result.user).sort(), ["created_at", "email", "id", "role", "username"]);
        assert.equal(JSON.stringify(result).includes(input.password), false);
      });

      await t.test("wrong passwords and unknown emails share a failure response", async () => {
        for (const body of [
          { email: input.email, password: "wrong-password" },
          { email: "missing-auth@example.com", password: input.password },
          { email: input.email, password: input.password.trim() },
        ]) {
          const response = await post("/api/auth/login", body);
          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), { message: "Invalid email or password." });
        }
      });

      await t.test("expired and modified tokens cannot load profiles", async () => {
        const expired = jwt.sign({ role: "member" }, config.jwtSecret, {
          subject: String(registered.id), issuer: "staj-user-service", audience: "staj-apis", expiresIn: -1,
        });
        for (const value of [expired, token + "x"]) {
          const response = await profile(value);
          assert.equal(response.status, 401);
          await response.arrayBuffer();
        }
      });

      await t.test("SQL-like lookup values cannot select a different user", async () => {
        assert.equal(await users.findByEmail("' OR '1'='1"), null);
        assert.equal(await users.findById(2_147_483_647), null);
      });

      await t.test("profile reads current data and login takes the role from storage", async () => {
        await database.query("UPDATE users SET username = $1, role = $2 WHERE id = $3", ["auth_updated", "admin", registered.id]);
        const response = await profile(token);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { user: { ...registered, username: "auth_updated", role: "admin" } });
        const login = await post("/api/auth/login", { email: input.email, password: input.password });
        assert.equal(login.status, 200);
        const result = await login.json() as { token: string };
        assert.deepEqual(tokens.verify(result.token), { id: registered.id, role: "admin" });
      });

      await t.test("deleted users cannot log in or use their previous profile token", async () => {
        await database.query("DELETE FROM users WHERE id = $1", [registered.id]);
        const response = await profile(token);
        assert.equal(response.status, 401);
        await response.arrayBuffer();
        const login = await post("/api/auth/login", { email: input.email, password: input.password });
        assert.equal(login.status, 401);
        assert.deepEqual(await login.json(), { message: "Invalid email or password." });
      });
    });
  } finally {
    await database.close();
  }
});
