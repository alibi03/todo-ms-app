import type { Request, Response } from "express";
import type { HealthResponse } from "../models/dto/responses/HealthResponse";

export class HealthController {
  constructor(private readonly checkDatabase: () => Promise<void>, private readonly isConsumerReady: () => boolean) {}

  async check(_request: Request, response: Response<HealthResponse>): Promise<void> {
    let database: "up" | "down" = "up";
    try { await this.checkDatabase(); } catch { database = "down"; }
    const broker = this.isConsumerReady() ? "up" : "down";
    const healthy = database === "up" && broker === "up";
    response.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "error", service: "notification-service", dependencies: { database, broker },
    });
  }
}
