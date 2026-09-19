import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app";
import withServer from "./testServer";

test("notification readiness requires both storage and a connected consumer", async () => {
  for (const databaseUp of [true, false]) for (const brokerUp of [true, false]) {
    await withServer(createApp(async () => { if (!databaseUp) throw new Error("private connection details"); }, () => brokerUp), async url => {
      const response = await fetch(url + "/api/health");
      assert.equal(response.status, databaseUp && brokerUp ? 200 : 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { status: databaseUp && brokerUp ? "ok" : "error", service: "notification-service",
        dependencies: { database: databaseUp ? "up" : "down", broker: brokerUp ? "up" : "down" } });
    });
  }
});

test("notification data has no unauthenticated HTTP endpoint", async () => {
  await withServer(createApp(async () => undefined, () => true), async url => {
    const response = await fetch(url + "/api/notifications");
    assert.equal(response.status, 404);
  });
});
