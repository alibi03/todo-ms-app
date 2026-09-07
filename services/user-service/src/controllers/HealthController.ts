import type { Request, Response } from "express";

import type { HealthResponse } from "../models/responses/ServiceResponses";
import type AppLogger from "../types/AppLogger";

class HealthController {
  constructor(
    private readonly checkDatabase: () => Promise<void>,
    private readonly logger: AppLogger
  ) {}

  readonly check = async (_request: Request, response: Response<HealthResponse>): Promise<void> => {
    try {
      await this.checkDatabase();
      response.json({
        status: "ok",
        service: "user-service",
        dependencies: { database: "up" },
      });
    } catch (error) {
      this.logger.error("User database health check failed.", error);
      response.status(503).json({
        status: "unavailable",
        service: "user-service",
        dependencies: { database: "down" },
      });
    }
  };
}

export default HealthController;
