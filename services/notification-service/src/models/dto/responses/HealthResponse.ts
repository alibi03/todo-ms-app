export interface HealthResponse {
  status: "ok" | "error";
  service: "notification-service";
  dependencies: { database: "up" | "down"; broker: "up" | "down" };
}
