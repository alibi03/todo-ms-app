import express, { type Express } from "express";
import HealthController from "./controllers/HealthController";
import TaskController from "./controllers/TaskController";
import type { ITaskService } from "./interfaces/services/ITaskService";
import type { IUserServiceClient } from "./interfaces/services/IUserServiceClient";
import createErrorHandler from "./middleware/errorHandler";
import createTaskRouter from "./routes/taskRoutes";
import type AppLogger from "./types/AppLogger";

type AppDependencies = {
  tasks: ITaskService;
  users: IUserServiceClient;
  checkDatabase: () => Promise<void>;
};

function createApp({ tasks, users, checkDatabase }: AppDependencies, logger: AppLogger = console): Express {
  const app = express();
  const controller = new TaskController(tasks);
  const health = new HealthController(checkDatabase);
  app.disable("x-powered-by");
  app.use("/api/tasks", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "20kb" }));
  app.get("/api/health", health.check.bind(health));
  app.use("/api/tasks", createTaskRouter(controller, users));
  app.use((_request, response) => { response.status(404).json({ message: "Route not found." }); });
  app.use(createErrorHandler(logger));
  return app;
}

export default createApp;
