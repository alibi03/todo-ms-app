import type { ErrorRequestHandler } from "express";
import { AuthenticationError } from "../errors/AuthenticationError";
import { DependencyUnavailableError } from "../errors/DependencyUnavailableError";
import { ValidationError } from "../errors/ValidationError";

export function createErrorHandler(logger: Pick<Console, "error">): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    const status = error instanceof AuthenticationError ? 401
      : error instanceof ValidationError ? 400
      : error instanceof DependencyUnavailableError ? 503 : undefined;
    if (status !== undefined && error instanceof Error) {
      if (status === 401) response.set("WWW-Authenticate", "Bearer");
      response.status(status).json({ message: error.message });
      return;
    }
    logger.error("Notification request failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    response.status(500).json({ message: "Internal server error." });
  };
}
