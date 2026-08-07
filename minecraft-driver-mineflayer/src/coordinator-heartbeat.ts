import { MineflayerDriverError } from "./errors.js";

export interface CoordinatorHeartbeatInput {
  id: string;
  name: string;
  role: string;
}

export type HeartbeatFetch = typeof fetch;

export const sendCoordinatorHeartbeat = async (
  coordinatorBaseUrl: string,
  input: CoordinatorHeartbeatInput,
  fetchImplementation: HeartbeatFetch = fetch,
): Promise<void> => {
  const response = await fetchImplementation(
    new URL("/agents/heartbeat", coordinatorBaseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(5_000),
    },
  );

  if (!response.ok) {
    throw new MineflayerDriverError(
      "CONNECTION_FAILED",
      `Coordinator heartbeat failed with HTTP ${response.status}.`,
    );
  }
};
