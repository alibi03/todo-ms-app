import { ConfigurationError } from "../errors/ConfigurationError";

type DatabaseConfig = { host: string; port: number; name: string; user: string; password: string };
type TaskServiceConfig = {
  port: number;
  database: DatabaseConfig;
  userServiceUrl: string;
  userServiceTimeoutMs: number;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ConfigurationError(name + " is required.");
  return value;
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, max: number): number {
  const raw = environment[name]?.trim() || String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ConfigurationError(name + " must be an integer between 1 and " + String(max) + ".");
  }
  return value;
}

function loadConfig(environment: NodeJS.ProcessEnv = process.env): TaskServiceConfig {
  let url: URL;
  try {
    url = new URL(required(environment, "USER_SERVICE_URL"));
  } catch {
    throw new ConfigurationError("USER_SERVICE_URL must be an HTTP or HTTPS origin.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) {
    throw new ConfigurationError("USER_SERVICE_URL must be an HTTP or HTTPS origin.");
  }
  return {
    port: integer(environment, "PORT", 3000, 65535),
    userServiceUrl: url.origin,
    userServiceTimeoutMs: integer(environment, "USER_SERVICE_TIMEOUT_MS", 3000, 10000),
    database: {
      host: required(environment, "DB_HOST"),
      port: integer(environment, "DB_PORT", 5432, 65535),
      name: required(environment, "DB_NAME"),
      user: required(environment, "DB_USER"),
      password: required(environment, "DB_PASSWORD"),
    },
  };
}

export { loadConfig, type DatabaseConfig, type TaskServiceConfig };
