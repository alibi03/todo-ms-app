import { ConfigurationError } from "../errors/ConfigurationError";

type DatabaseConfig = {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
};

type UserServiceConfig = {
  port: number;
  database: DatabaseConfig;
  jwtSecret: string;
};

function requireValue(
  environment: NodeJS.ProcessEnv,
  name: string
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new ConfigurationError(name + " is required.");
  }

  return value;
}

function readPort(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback?: number
): number {
  const rawValue = environment[name]?.trim();

  if (!rawValue && fallback !== undefined) {
    return fallback;
  }

  const port = Number(rawValue);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigurationError(name + " must be an integer between 1 and 65535.");
  }

  return port;
}

function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): UserServiceConfig {
  const jwtSecret = requireValue(environment, "JWT_SECRET");

  if (Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new ConfigurationError("JWT_SECRET must contain at least 32 bytes.");
  }

  return {
    port: readPort(environment, "PORT", 3000),
    jwtSecret,
    database: {
      host: requireValue(environment, "DB_HOST"),
      port: readPort(environment, "DB_PORT", 5432),
      name: requireValue(environment, "DB_NAME"),
      user: requireValue(environment, "DB_USER"),
      password: requireValue(environment, "DB_PASSWORD"),
    },
  };
}

export { loadConfig, type DatabaseConfig, type UserServiceConfig };
