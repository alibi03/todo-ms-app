import express, { type Express } from "express";

type DatabaseHealthCheck = () => Promise<void>;

type AppLogger = {
  error(message: string, error: unknown): void;
};

function createApp(
  checkDatabase: DatabaseHealthCheck,
  logger: AppLogger = console
): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));

  app.get("/", (_request, response) => {
    response.json({
      service: "user-service",
      message: "User Service is running.",
    });
  });

  app.get("/api/health", async (_request, response) => {
    try {
      await checkDatabase();
      response.json({
        status: "ok",
        service: "user-service",
        dependencies: { database: "up" },
      });
    } catch (error) {
      logger.error("User database health check failed.", error);
      response.status(503).json({
        status: "unavailable",
        service: "user-service",
        dependencies: { database: "down" },
      });
    }
  });

  return app;
}

export default createApp;
