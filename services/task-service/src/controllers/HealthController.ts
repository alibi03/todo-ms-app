import type { Request, Response } from "express";
import type { HealthResponse } from "../models/dto/responses/HealthResponse";

export class HealthController {
  constructor(private readonly checkDatabase: () => Promise<void>) {}

  async check(_request: Request, response: Response<HealthResponse>): Promise<void> {
    try {
      await this.checkDatabase();
      response.json({ status: "ok", service: "task-service", dependencies: { database: "up" } });
    } catch {
      response.status(503).json({ status: "error", service: "task-service", dependencies: { database: "down" } });
    }
  }
}
