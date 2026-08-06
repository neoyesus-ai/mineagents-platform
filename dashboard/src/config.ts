export interface DashboardConfig {
  port: number;
  coordinatorBaseUrl: string;
  refreshSeconds: number;
}

const parseInteger = (
  value: string | undefined,
  fallback: number,
  field: string,
  minimum: number,
  maximum: number,
): number => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
};

export const normalizeCoordinatorBaseUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("COORDINATOR_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("COORDINATOR_URL must use http or https.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError("COORDINATOR_URL cannot contain credentials, query parameters or fragments.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
};

export const parseDashboardConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): DashboardConfig => ({
  port: parseInteger(
    environment.DASHBOARD_PORT ?? environment.PORT,
    3001,
    "DASHBOARD_PORT",
    1,
    65_535,
  ),
  coordinatorBaseUrl: normalizeCoordinatorBaseUrl(
    environment.COORDINATOR_URL ?? "http://127.0.0.1:3000",
  ),
  refreshSeconds: parseInteger(
    environment.DASHBOARD_REFRESH_SECONDS,
    10,
    "DASHBOARD_REFRESH_SECONDS",
    5,
    3_600,
  ),
});
