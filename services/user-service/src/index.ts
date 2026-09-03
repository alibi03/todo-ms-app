import "dotenv/config";

import type { Server } from "node:http";

import createApp from "./app";
import { loadConfig } from "./config";
import UserDatabase from "./database";

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new UserDatabase(config.database);

  try {
    await database.migrate();
  } catch (error) {
    await database.close().catch(() => undefined);
    throw error;
  }

  const app = createApp(() => database.checkHealth());
  const server = app.listen(config.port, "0.0.0.0");
  await listen(server);

  console.log(
    "User Service listening on http://0.0.0.0:" + String(config.port)
  );

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(signal + " received. Shutting down User Service.");

    const results = await Promise.allSettled([
      closeServer(server),
      database.close(),
    ]);
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    if (failed) {
      console.error("User Service shutdown failed.", failed.reason);
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error: unknown) => {
  console.error("User Service failed to start.", error);
  process.exitCode = 1;
});
