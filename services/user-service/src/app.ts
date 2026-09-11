import express, { type Express } from "express";

import AuthController from "./controllers/AuthController";
import HealthController from "./controllers/HealthController";
import ProfileController from "./controllers/ProfileController";
import createErrorHandler from "./middleware/errorHandler";
import type { IAuthenticationService } from "./interfaces/services/IAuthenticationService";
import type { IRegistrationService } from "./interfaces/services/IRegistrationService";
import type { ITokenService } from "./interfaces/services/ITokenService";
import createAuthRouter from "./routes/authRoutes";
import createProfileRouter from "./routes/profileRoutes";
import type AppLogger from "./types/AppLogger";

type AppDependencies = {
  checkDatabase: () => Promise<void>;
  registration: IRegistrationService;
  authentication: IAuthenticationService;
  tokens: ITokenService;
};

function createApp(
  { checkDatabase, registration, authentication, tokens }: AppDependencies,
  logger: AppLogger = console
): Express {
  const app = express();
  const authController = new AuthController(registration, authentication);
  const profileController = new ProfileController(authentication);
  const healthController = new HealthController(checkDatabase, logger);

  app.disable("x-powered-by");
  app.use(["/api/auth", "/api/profile"], (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "20kb" }));

  app.get("/", (_request, response) => {
    response.json({
      service: "user-service",
      message: "User Service is running.",
    });
  });

  app.get("/api/health", healthController.check.bind(healthController));
  app.use("/api/auth", createAuthRouter(authController));
  app.use("/api/profile", createProfileRouter(profileController, tokens));

  app.use((_request, response) => {
    response.status(404).json({ message: "Route not found." });
  });

  app.use(createErrorHandler(logger));
  return app;
}

export default createApp;
