interface HealthResponse {
  status: "ok" | "error";
  service: "task-service";
  dependencies: { database: "up" | "down" };
}

export type { HealthResponse };
