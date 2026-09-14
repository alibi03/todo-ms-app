import type { ErrorRequestHandler } from "express";
import { AuthenticationError } from "../errors/AuthenticationError";
import { DependencyUnavailableError } from "../errors/DependencyUnavailableError";
import { ValidationError } from "../errors/ValidationError";
import { NotFoundError } from "../errors/NotFoundError";
import type AppLogger from "../types/AppLogger";

function createErrorHandler(logger: AppLogger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    const status = error instanceof AuthenticationError ? 401
      : error instanceof ValidationError ? 400
      : error instanceof NotFoundError ? 404
      : error instanceof DependencyUnavailableError ? 503 : undefined;
    if (status !== undefined && error instanceof Error) {
      if (status === 401) response.set("WWW-Authenticate", "Bearer");
      response.status(status).json({ message: error.message });
      return;
    }
    const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
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
    logger.error("Task request failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    response.status(500).json({ message: "Internal server error." });
  };
}

export default createErrorHandler;
