import { runSupervisedAgentSmoke } from "./agent-smoke.js";
import { parseAgentSmokeConfig } from "./agent-smoke-config.js";
import { connectMineflayerDriver } from "./mineflayer-driver.js";

const main = async (): Promise<void> => {
  const config = parseAgentSmokeConfig();
  const driver = await connectMineflayerDriver({
    host: config.connection.host,
    port: config.connection.port,
    username: config.connection.username,
    version: config.connection.version,
    connectTimeoutMs: config.connection.connectTimeoutMs,
    chunksTimeoutMs: config.connection.chunksTimeoutMs,
    movementTimeoutMs: config.connection.movementTimeoutMs,
  });

  try {
    const result = await runSupervisedAgentSmoke(driver, {
      target: config.target,
      blockName: config.blockName,
      approved: config.approved,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  } finally {
    driver.close("MineAgents supervised agent smoke complete");
    await driver.waitForDisconnect();
  }
};

const errorChain = (error: unknown): string[] => {
  const messages: string[] = [];
  let current = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages;
};

main().catch((error: unknown) => {
  const nestedErrors =
    error instanceof AggregateError
      ? error.errors.map((nested) =>
          nested instanceof Error ? nested.message : String(nested),
        )
      : undefined;
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        error instanceof Error && "code" in error
          ? (error as Error & { code: unknown }).code
          : null,
      message: error instanceof Error ? error.message : "Unknown smoke-test error",
      causes: errorChain(error),
      nestedErrors,
    })}\n`,
  );
  process.exitCode = 1;
});
