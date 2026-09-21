import { ConfigurationError } from "../errors/ConfigurationError";

export type DatabaseConfig = { host: string; port: number; name: string; user: string; password: string };

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): {
  port: number; database: DatabaseConfig; userServiceUrl: string; userServiceTimeoutMs: number;
} {
  function required(key: string): string {
    const value = environment[key]?.trim();
    if (!value) throw new ConfigurationError(key + " is required.");
    return value;
  }
  function port(key: string, fallback: number): number {
    const raw = environment[key] ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 65535) {
      throw new ConfigurationError(key + " must be a valid port.");
    }
    return value;
  }
  let url: URL;
  try { url = new URL(required("USER_SERVICE_URL")); }
  catch { throw new ConfigurationError("USER_SERVICE_URL must be an HTTP or HTTPS origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) {
    throw new ConfigurationError("USER_SERVICE_URL must be an HTTP or HTTPS origin.");
  }
  const rawTimeout = environment.USER_SERVICE_TIMEOUT_MS ?? "3000";
  const timeout = Number(rawTimeout);
  if (!/^\d+$/.test(rawTimeout) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 10000) {
    throw new ConfigurationError("USER_SERVICE_TIMEOUT_MS must be between 1 and 10000.");
  }
  return {
    userServiceUrl: url.origin,
    userServiceTimeoutMs: timeout,
    port: port("PORT", 3000),
    database: {
      host: required("DB_HOST"), port: port("DB_PORT", 5432), name: required("DB_NAME"),
      user: required("DB_USER"), password: required("DB_PASSWORD"),
    },
  };
}
