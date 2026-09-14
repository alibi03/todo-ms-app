import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config/environment";

const environment = {
  DB_HOST: "task-db", DB_PORT: "5432", DB_NAME: "staj_tasks", DB_USER: "staj_task",
  DB_PASSWORD: "test-only-password", USER_SERVICE_URL: "http://user-service:3000",
};

test("configuration keeps user REST access separate from task database credentials", () => {
  const config = loadConfig(environment);
  assert.equal(config.userServiceUrl, "http://user-service:3000");
  assert.equal(config.userServiceTimeoutMs, 3000);
  assert.equal(config.database.host, "task-db");
  assert.equal("jwtSecret" in config, false);
});

test("configuration rejects unsafe or malformed User Service origins", () => {
  for (const url of ["", "invalid", "file:///tmp/test", "http://user:password@localhost", "http://localhost/path", "http://localhost?token=x", "http://localhost#fragment"]) {
    assert.throws(() => loadConfig({ ...environment, USER_SERVICE_URL: url }));
  }
});

test("configuration requires database values and bounded ports and timeouts", () => {
  for (const key of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    assert.throws(() => loadConfig({ ...environment, [key]: "" }));
  }
  for (const value of ["0", "-1", "1.2", "Infinity", "10001"]) {
    assert.throws(() => loadConfig({ ...environment, USER_SERVICE_TIMEOUT_MS: value }));
  }
  assert.throws(() => loadConfig({ ...environment, PORT: "65536" }));
});
