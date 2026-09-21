import express, { type Express } from "express";
import { HealthController } from "./controllers/HealthController";
import { NotificationController } from "./controllers/NotificationController";
import type { INotificationService } from "./interfaces/services/INotificationService";
import type { IUserServiceClient } from "./interfaces/services/IUserServiceClient";
import { createErrorHandler } from "./middleware/errorHandler";
import { createNotificationRouter } from "./routes/notificationRoutes";

type AppDependencies = {
  notificationService: INotificationService;
  userServiceClient: IUserServiceClient;
  checkDatabase: () => Promise<void>;
  isConsumerReady: () => boolean;
};

export function createApp({ notificationService, userServiceClient, checkDatabase, isConsumerReady }: AppDependencies,
  logger: Pick<Console, "error"> = console): Express {
  const app = express();
  const healthController = new HealthController(checkDatabase, isConsumerReady);
  app.disable("x-powered-by");
  app.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  app.get("/api/health", healthController.check.bind(healthController));
  app.use("/api/notifications", createNotificationRouter(new NotificationController(notificationService), userServiceClient));
  app.use((_request, response) => { response.status(404).json({ message: "Route not found." }); });
  app.use(createErrorHandler(logger));
  return app;
}
