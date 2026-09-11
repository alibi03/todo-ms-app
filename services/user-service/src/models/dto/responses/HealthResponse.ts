interface HealthResponse {
  status: "ok" | "unavailable";
  service: "user-service";
  dependencies: { database: "up" | "down" };
}

export { type HealthResponse };
