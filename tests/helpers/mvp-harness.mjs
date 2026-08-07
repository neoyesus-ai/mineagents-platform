import assert from "node:assert/strict";
import { once } from "node:events";

export const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an IPv4 server address.");
  }
  return `http://127.0.0.1:${address.port}`;
};

export const close = async (server) => {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

export const jsonRequest = async (baseUrl, path, options = {}) => {
  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  assert.equal(response.status, options.status ?? 200);
  return response.json();
};

export const positionKey = ({ dimension, x, y, z }) =>
  `${dimension}:${x}:${y}:${z}`;

export const createWorldDriver = (initialBlocks, initialPosition) => {
  const blocks = new Map(initialBlocks);
  const mutations = [];
  const blockName = (target) => blocks.get(positionKey(target)) ?? "minecraft:air";

  return {
    blocks,
    mutations,
    driver: {
      async getState() {
        return { connected: true, position: { ...initialPosition } };
      },
      async inspectBlock(target) {
        const name = blockName(target);
        return { position: { ...target }, name, solid: name !== "minecraft:air" };
      },
      async moveTo() {
        throw new Error("The MVP flow does not require movement.");
      },
      async placeBlock(target, name, expectedCurrentBlockNames) {
        assert.ok(expectedCurrentBlockNames.includes(blockName(target)));
        blocks.set(positionKey(target), name);
        mutations.push({ action: "place-block", position: { ...target }, blockName: name });
      },
      async breakBlock(target, expectedBlockName) {
        assert.equal(blockName(target), expectedBlockName);
        blocks.set(positionKey(target), "minecraft:air");
        mutations.push({
          action: "break-block",
          position: { ...target },
          blockName: expectedBlockName,
        });
      },
    },
  };
};
