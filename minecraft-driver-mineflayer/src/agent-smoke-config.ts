import type { WorldPosition } from "@mineagents/minecraft-adapter";
import {
  parseMineflayerObserverConfig,
  type MineflayerObserverConfig,
} from "./config.js";
import { MineflayerDriverError } from "./errors.js";

export const agentSmokeApprovalPhrase =
  "I_APPROVE_REVERSIBLE_WRITES_TO_A_DISPOSABLE_WORLD";

export interface AgentSmokeConfig {
  connection: MineflayerObserverConfig;
  target: WorldPosition;
  blockName: string;
  approved: true;
}

const blockNamePattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const integerPattern = /^-?(?:0|[1-9]\d*)$/;

const parseTarget = (
  rawTarget: string | undefined,
  dimension: string,
): WorldPosition => {
  const values = rawTarget?.split(",") ?? [];
  if (
    values.length !== 3 ||
    !values.every((value) => integerPattern.test(value.trim()))
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "MINECRAFT_AGENT_SMOKE_TARGET must contain exact integer coordinates as x,y,z.",
    );
  }

  const [x, y, z] = values.map((value) => Number(value.trim()));
  if (
    x === undefined ||
    y === undefined ||
    z === undefined ||
    ![x, y, z].every(Number.isSafeInteger)
  ) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "MINECRAFT_AGENT_SMOKE_TARGET coordinates must be safe integers.",
    );
  }

  return { dimension, x, y, z };
};

export const parseAgentSmokeConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): AgentSmokeConfig => {
  if (environment.MINECRAFT_AGENT_SMOKE_APPROVAL !== agentSmokeApprovalPhrase) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      `MINECRAFT_AGENT_SMOKE_APPROVAL must equal '${agentSmokeApprovalPhrase}'.`,
    );
  }

  const dimension = (
    environment.MINECRAFT_AGENT_SMOKE_DIMENSION ?? "minecraft:overworld"
  ).trim();
  if (!/^minecraft:[a-z0-9_./-]+$/.test(dimension)) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "MINECRAFT_AGENT_SMOKE_DIMENSION must be a namespaced Minecraft dimension.",
    );
  }

  const blockName = (environment.MINECRAFT_AGENT_SMOKE_BLOCK ?? "").trim();
  if (!blockNamePattern.test(blockName)) {
    throw new MineflayerDriverError(
      "INVALID_CONFIG",
      "MINECRAFT_AGENT_SMOKE_BLOCK must be an exact namespaced block identifier.",
    );
  }

  return {
    connection: parseMineflayerObserverConfig(environment),
    target: parseTarget(environment.MINECRAFT_AGENT_SMOKE_TARGET, dimension),
    blockName,
    approved: true,
  };
};
