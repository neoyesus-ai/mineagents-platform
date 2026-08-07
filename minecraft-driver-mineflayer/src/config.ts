import { MineflayerDriverError } from "./errors.js";

export interface MineflayerObserverConfig {
  host: string;
  port: number;
  username: string;
  version: string;
  coordinatorBaseUrl: string;
  heartbeatIntervalMs: number;
  connectTimeoutMs: number;
  chunksTimeoutMs: number;
  movementTimeoutMs: number;
}

const requiredText = (
  value: string | undefined,
  fallback: string,
  field: string,
): string => {
  const normalized = (value ?? fallback).trim();
  if (normalized.length === 0) {
    throw new MineflayerDriverError("INVALID_CONFIG", `${field} must not be empty.`);
  }
  return normalized;
};

const integerInRange = (
  value: string | undefined,
  fallback: number,
  field: string,
  min: number,
  max: number,
): number => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `${field} must be an integer between ${min} and ${max}.`,
    );
  }
  return parsed;
};

const coordinatorUrl = (value: string | undefined): string => {
  const raw = requiredText(value, "http://127.0.0.1:3000", "COORDINATOR_URL");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MineflayerDriverError("INVALID_CONFIG", "COORDINATOR_URL must be a valid URL.");
  }

  if (
    parsed.protocol !== "http:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "COORDINATOR_URL must be an HTTP origin without credentials, path, query or fragment.",
    );
  }
  return parsed.origin;
};

export const parseMineflayerObserverConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): MineflayerObserverConfig => ({
  host: requiredText(environment.MINECRAFT_HOST, "127.0.0.1", "MINECRAFT_HOST"),
  port: integerInRange(environment.MINECRAFT_PORT, 25565, "MINECRAFT_PORT", 1, 65_535),
  username: requiredText(
    environment.MINECRAFT_USERNAME,
    "MineObserver",
    "MINECRAFT_USERNAME",
  ),
  version: requiredText(
    environment.MINECRAFT_VERSION,
    "1.21.11",
    "MINECRAFT_VERSION",
  ),
  coordinatorBaseUrl: coordinatorUrl(environment.COORDINATOR_URL),
  heartbeatIntervalMs: integerInRange(
    environment.AGENT_HEARTBEAT_INTERVAL_MS,
    15_000,
    "AGENT_HEARTBEAT_INTERVAL_MS",
    5_000,
    300_000,
  ),
  connectTimeoutMs: integerInRange(
    environment.MINECRAFT_CONNECT_TIMEOUT_MS,
    30_000,
    "MINECRAFT_CONNECT_TIMEOUT_MS",
    1_000,
    120_000,
  ),
  chunksTimeoutMs: integerInRange(
    environment.MINECRAFT_CHUNKS_TIMEOUT_MS,
    30_000,
    "MINECRAFT_CHUNKS_TIMEOUT_MS",
    1_000,
    120_000,
  ),
  movementTimeoutMs: integerInRange(
    environment.MINECRAFT_MOVEMENT_TIMEOUT_MS,
    30_000,
    "MINECRAFT_MOVEMENT_TIMEOUT_MS",
    1_000,
    300_000,
  ),
});
