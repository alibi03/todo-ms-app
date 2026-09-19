import "dotenv/config";
import { once } from "node:events";
import { createApp } from "./app";
import { loadConfig } from "./config/environment";
import { loadBrokerConfig } from "./config/broker";
import { NotificationDatabase } from "./database/NotificationDatabase";
import { NotificationRepository } from "./repositories/NotificationRepository";
import { NotificationService } from "./services/NotificationService";
import { NotificationConsumer } from "./messaging/NotificationConsumer";

async function main(): Promise<void> {
  const config = loadConfig();
  const brokerConfig = loadBrokerConfig();
  const database = new NotificationDatabase(config.database);
  const notificationService = new NotificationService(new NotificationRepository(database));
  const consumer = new NotificationConsumer(brokerConfig, notificationService);
  try {
    await database.migrate();
    const app = createApp(() => database.checkHealth(), () => consumer.isReady());
    const server = app.listen(config.port, "0.0.0.0");
    await once(server, "listening");
    consumer.start();
    console.log("Notification Service listening on port " + String(config.port));
    let stopping = false;
    async function shutdown(): Promise<void> {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 15_000);
      deadline.unref();
      try {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } catch {
        console.error("Notification Service shutdown failed.");
        process.exitCode = 1;
      } finally {
        await consumer.stop().catch(() => { process.exitCode = 1; });
        await database.close().catch(() => { process.exitCode = 1; });
        clearTimeout(deadline);
      }
    }
    process.once("SIGINT", () => { void shutdown(); });
    process.once("SIGTERM", () => { void shutdown(); });
  } catch (error) {
    await consumer.stop();
    await database.close().catch(() => undefined);
    throw error;
  }
}

void main().catch(() => {
  console.error("Notification Service failed to start. Check its configuration and database availability.");
  process.exitCode = 1;
});
