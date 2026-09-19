import { ConfigurationError } from "../errors/ConfigurationError";

export type BrokerConfig = { hostname: string; port: number; username: string; password: string; vhost: string };

export function loadBrokerConfig(environment: NodeJS.ProcessEnv = process.env): BrokerConfig {
  function required(key: string): string {
    const value = environment[key]?.trim();
    if (!value) throw new ConfigurationError(key + " is required.");
    return value;
  }
  const rawPort = environment.RABBITMQ_PORT ?? "5672";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("RABBITMQ_PORT must be a valid port.");
  }
  return {
    hostname: required("RABBITMQ_HOST"), port, username: required("RABBITMQ_USER"),
    password: required("RABBITMQ_PASSWORD"), vhost: required("RABBITMQ_VHOST"),
  };
}
