import "dotenv/config";
import { once } from "node:events";
import createApp from "./app";
import { UserServiceClient } from "./clients/UserServiceClient";
import { loadConfig } from "./config/environment";
import { TaskDatabase } from "./database/TaskDatabase";
import { TaskRepository } from "./repositories/TaskRepository";
import { TaskService } from "./services/TaskService";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new TaskDatabase(config.database);
  const userServiceClient = new UserServiceClient(config.userServiceUrl, config.userServiceTimeoutMs);
  const app = createApp({
    tasks: new TaskService(new TaskRepository(database), userServiceClient),
    users: userServiceClient,
    checkDatabase: () => database.checkHealth(),
  });
  try {
    await database.migrate();
    const server = app.listen(config.port, "0.0.0.0");
    await once(server, "listening");
    console.log("Task Service listening on port " + String(config.port));
    let shuttingDown = false;
    const shutdown = async (): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      const deadline = setTimeout(() => process.exit(1), 10_000);
      deadline.unref();
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      } catch {
        console.error("Task Service shutdown failed.");
        process.exitCode = 1;
      } finally {
        await database.close().catch(() => {
          console.error("Task database shutdown failed.");
          process.exitCode = 1;
        });
        clearTimeout(deadline);
      }
    };
    process.once("SIGINT", () => { void shutdown(); });
    process.once("SIGTERM", () => { void shutdown(); });
  } catch (error) {
    await database.close().catch(() => undefined);
    throw error;
  }
}

void main().catch(() => {
  console.error("Task Service failed to start. Check its configuration and database availability.");
  process.exitCode = 1;
});
