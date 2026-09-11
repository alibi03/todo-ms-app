import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";

import createApp from "../src/app";
import { loadConfig } from "../src/config/environment";
import UserDatabase from "../src/database/UserDatabase";
import RegistrationService from "../src/services/RegistrationService";
import UserRepository from "../src/repositories/UserRepository";
import type { PublicUserResponse } from "../src/models/dto/responses/PublicUserResponse";
import withServer from "./testServer";
import unusedAuth from "./testAuth";

test("registration works with a fresh PostgreSQL database", async (t) => {
  const config = loadConfig();
  assert.match(config.database.name, /^staj_users_test_[a-z0-9_]+$/, "Use a dedicated staj_users_test_* database.");
  const database = new UserDatabase(config.database);

  try {
    await t.test("migration creates user tables and can run twice", async () => {
      await database.migrate();
      await database.migrate();
      const tables = await database.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
      );
      assert.deepEqual(tables.rows.map((row) => row.tablename), ["password_reset_codes", "pgmigrations", "schema_migrations", "users"]);
      const migrations = await database.query<{ name: string }>("SELECT name FROM schema_migrations");
      assert.deepEqual(migrations.rows, [{ name: "001_initial_user_schema" }]);
    });

    const registration = new RegistrationService(new UserRepository(database));
    const app = createApp({ ...unusedAuth, checkDatabase: () => database.checkHealth(), registration });
    const password = "Example-test-password-123!";

    await withServer(app, async (baseUrl) => {
      const post = (body: unknown) => fetch(baseUrl + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      await t.test("HTTP registration stores a bcrypt hash and returns only public fields", async () => {
        const response = await post({ username: "  integration_user  ", email: "  Integration@Example.COM  ", password });
        assert.equal(response.status, 201);
        const body = await response.json() as { message: string; user: PublicUserResponse };
        assert.equal(body.message, "User registered successfully.");
        assert.deepEqual(Object.keys(body.user).sort(), ["created_at", "email", "id", "role", "username"]);
        assert.equal(body.user.username, "integration_user");
        assert.equal(body.user.email, "integration@example.com");
        assert.equal(body.user.role, "member");
        assert.ok(Number.isFinite(Date.parse(body.user.created_at)));

        const stored = await database.query<{ password_hash: string; role: string }>(
          "SELECT password_hash, role FROM users WHERE id = $1", [body.user.id]
        );
        assert.equal(stored.rowCount, 1);
        assert.equal(stored.rows[0]!.role, "member");
        assert.notEqual(stored.rows[0]!.password_hash, password);
        assert.equal(bcrypt.getRounds(stored.rows[0]!.password_hash), 12);
        assert.equal(await bcrypt.compare(password, stored.rows[0]!.password_hash), true);
        assert.equal(JSON.stringify(body).includes(stored.rows[0]!.password_hash), false);
      });

      await t.test("duplicate username and case-normalized email both produce 409", async () => {
        const bodies = [
          { username: "integration_user", email: "different@example.com", password },
          { username: "different_user", email: "INTEGRATION@EXAMPLE.COM", password },
        ];

        for (const body of bodies) {
          const response = await post(body);
          assert.equal(response.status, 409);
          assert.deepEqual(await response.json(), { message: "Username or email already exists." });
        }
      });

      await t.test("two simultaneous registrations for one email yield one success", async () => {
        const responses = await Promise.all([
          post({ username: "race_user_a", email: "race@example.com", password }),
          post({ username: "race_user_b", email: "RACE@example.com", password }),
        ]);
        assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
        await Promise.all(responses.map((response) => response.arrayBuffer()));
        const rows = await database.query("SELECT id FROM users WHERE email = $1", ["race@example.com"]);
        assert.equal(rows.rowCount, 1);
      });

      await t.test("SQL-looking usernames are stored as text through query parameters", async () => {
        const username = "reader'; DROP TABLE users; --";
        const response = await post({ username, email: "sql-test@example.com", password });
        assert.equal(response.status, 201);
        const body = await response.json() as { user: PublicUserResponse };
        assert.equal(body.user.username, username);
        const rows = await database.query("SELECT id FROM users WHERE username = $1", [username]);
        assert.equal(rows.rowCount, 1);
      });

      await t.test("invalid input and requested admin role add no database rows", async () => {
        const before = await database.query("SELECT id FROM users");
        for (const input of [
          { username: "invalid", email: "not-an-email", password },
          { username: "admin_attempt", email: "admin-test@example.com", password, role: "admin" },
        ]) {
          const response = await post(input);
          assert.equal(response.status, 400);
          await response.arrayBuffer();
        }
        const after = await database.query("SELECT id FROM users");
        assert.equal(after.rowCount, before.rowCount);
      });
    });
  } finally {
    await database.close();
  }
});
