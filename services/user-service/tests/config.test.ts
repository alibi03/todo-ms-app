import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config";

const validEnvironment: NodeJS.ProcessEnv = {
  PORT: "3000",
  DB_HOST: "user-db",
  DB_PORT: "5432",
  DB_NAME: "staj_users",
  DB_USER: "staj_user",
  DB_PASSWORD: "test-only-password",
  JWT_SECRET: "test-only-jwt-secret-not-for-deployment",
};

test("configuration reads container hostnames and ports", () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.port, 3000);
  assert.equal(config.database.host, "user-db");
  assert.equal(config.database.port, 5432);
  assert.equal(config.database.name, "staj_users");
  assert.equal(config.jwtSecret, validEnvironment.JWT_SECRET);
});

test("configuration requires a signing secret of at least 32 bytes", () => {
  for (const JWT_SECRET of [undefined, "", "  ", "short", "a".repeat(31)]) {
    assert.throws(() => loadConfig({ ...validEnvironment, JWT_SECRET }), /JWT_SECRET/);
  }
  assert.equal(loadConfig({ ...validEnvironment, JWT_SECRET: "a".repeat(32) }).jwtSecret.length, 32);
});

test("configuration rejects a missing database password", () => {
  const environment = { ...validEnvironment };
  delete environment.DB_PASSWORD;

  assert.throws(() => loadConfig(environment), /DB_PASSWORD is required/);
});

test("configuration rejects an invalid port", () => {
  assert.throws(
    () => loadConfig({ ...validEnvironment, PORT: "not-a-port" }),
    /PORT must be an integer/
  );
});
