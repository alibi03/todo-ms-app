import { ConfigurationError } from "../errors/ConfigurationError";

export type DatabaseConfig = { host: string; port: number; name: string; user: string; password: string };

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): { port: number; database: DatabaseConfig } {
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
  return {
    port: port("PORT", 3000),
    database: {
      host: required("DB_HOST"), port: port("DB_PORT", 5432), name: required("DB_NAME"),
      user: required("DB_USER"), password: required("DB_PASSWORD"),
    },
  };
}
