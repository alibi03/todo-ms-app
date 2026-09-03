import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import createApp from "../src/app";

async function startServer(
  checkDatabase: () => Promise<void>
): Promise<{ baseUrl: string; server: Server }> {
  const server = createApp(checkDatabase, {
    error: () => undefined,
  }).listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port.");
  }

  return {
    baseUrl: "http://127.0.0.1:" + String(address.port),
    server,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("health endpoint reports a reachable database", async () => {
  const { baseUrl, server } = await startServer(async () => undefined);

  try {
    const response = await fetch(baseUrl + "/api/health");
    const body = (await response.json()) as {
      status: string;
      dependencies: { database: string };
    };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.dependencies.database, "up");
  } finally {
    await stopServer(server);
  }
});

test("health endpoint reports an unavailable database", async () => {
  const { baseUrl, server } = await startServer(async () => {
    throw new Error("database unavailable");
  });

  try {
    const response = await fetch(baseUrl + "/api/health");
    const body = (await response.json()) as {
      status: string;
      dependencies: { database: string };
    };

    assert.equal(response.status, 503);
    assert.equal(body.status, "unavailable");
    assert.equal(body.dependencies.database, "down");
  } finally {
    await stopServer(server);
  }
});
