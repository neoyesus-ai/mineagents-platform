import {
  connectMineflayerDriver,
  parseMineflayerObserverConfig,
} from "./index.js";
import { runBoundedMovementSmoke } from "./movement-smoke.js";

const main = async (): Promise<void> => {
  const config = parseMineflayerObserverConfig();
  const driver = await connectMineflayerDriver({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    connectTimeoutMs: config.connectTimeoutMs,
    chunksTimeoutMs: config.chunksTimeoutMs,
    movementTimeoutMs: config.movementTimeoutMs,
  });

  try {
    const result = await runBoundedMovementSmoke(driver);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  } finally {
    driver.close("MineAgents bounded movement smoke complete");
    await driver.waitForDisconnect();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        error instanceof Error && "code" in error
          ? (error as Error & { code: unknown }).code
          : null,
      message: error instanceof Error ? error.message : "Unknown smoke-test error",
    })}\n`,
  );
  process.exitCode = 1;
});
