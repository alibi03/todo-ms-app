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
};

function requireValue(
  environment: NodeJS.ProcessEnv,
  name: string
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(name + " is required.");
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
    throw new Error(name + " must be an integer between 1 and 65535.");
  }

  return port;
}

function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): UserServiceConfig {
  return {
    port: readPort(environment, "PORT", 3000),
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
