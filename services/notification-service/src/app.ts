import express, { type Express } from "express";
import { HealthController } from "./controllers/HealthController";

export function createApp(checkDatabase: () => Promise<void>, isConsumerReady: () => boolean): Express {
  const app = express();
  const healthController = new HealthController(checkDatabase, isConsumerReady);
  app.disable("x-powered-by");
  app.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  app.get("/api/health", healthController.check.bind(healthController));
  app.use((_request, response) => { response.status(404).json({ message: "Route not found." }); });
  return app;
}
