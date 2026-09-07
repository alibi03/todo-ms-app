import express, { type ErrorRequestHandler, type Express } from "express";
import { rateLimit } from "express-rate-limit";

import authenticate from "./authenticate";
import type AuthenticationService from "./authentication";
import HttpError from "./errors";
import type RegistrationService from "./registration";
import type TokenService from "./token";

type AppDependencies = {
  checkDatabase: () => Promise<void>;
  registration: Pick<RegistrationService, "register">;
  authentication: Pick<AuthenticationService, "login" | "getProfile">;
  tokens: Pick<TokenService, "verify">;
};

type AppLogger = {
  error(message: string, error: unknown): void;
};

function createApp(
  { checkDatabase, registration, authentication, tokens }: AppDependencies,
  logger: AppLogger = console
): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(["/api/auth", "/api/profile"], (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "20kb" }));

  const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many registration attempts. Please try again later." },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many login attempts. Please try again later." },
  });

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

  app.post("/api/auth/register", registrationLimiter, async (request, response) => {
    const user = await registration.register(request.body);
    response.status(201).json({ message: "User registered successfully.", user });
  });

  app.post("/api/auth/login", loginLimiter, async (request, response) => {
    response.json(await authentication.login(request.body));
  });

  app.get("/api/profile", authenticate(tokens), async (_request, response) => {
    const user = await authentication.getProfile(response.locals.userId as number);
    response.json({ user });
  });

  app.use((_request, response) => {
    response.status(404).json({ message: "Route not found." });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) {
      if (error.statusCode === 401) {
        response.set("WWW-Authenticate", "Bearer");
      }
      response.status(error.statusCode).json({ message: error.message });
      return;
    }

    const type = typeof error === "object" && error !== null && "type" in error
      ? error.type
      : undefined;

    if (type === "entity.parse.failed") {
      response.status(400).json({ message: "Request body must be valid JSON." });
      return;
    }

    if (type === "entity.too.large") {
      response.status(413).json({ message: "Request body exceeds the 20kb limit." });
      return;
    }

    if (type === "charset.unsupported" || type === "encoding.unsupported") {
      response.status(415).json({ message: "Unsupported request encoding." });
      return;
    }

    logger.error("User request failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    response.status(500).json({ message: "Internal server error." });
  };

  app.use(handleError);
  return app;
}

export default createApp;
