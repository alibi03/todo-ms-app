import type { ErrorRequestHandler } from "express";

import { AuthenticationError } from "../errors/AuthenticationError";
import { ConflictError } from "../errors/ConflictError";
import { ValidationError } from "../errors/ValidationError";
import type AppLogger from "../types/AppLogger";

function createErrorHandler(logger: AppLogger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    const status = error instanceof ValidationError ? 400
      : error instanceof AuthenticationError ? 401
      : error instanceof ConflictError ? 409
      : undefined;

    if (status !== undefined && error instanceof Error) {
      if (status === 401) {
        response.set("WWW-Authenticate", "Bearer");
      }
      response.status(status).json({ message: error.message });
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
}

export default createErrorHandler;
