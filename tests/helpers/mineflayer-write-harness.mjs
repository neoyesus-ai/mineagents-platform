import { EventEmitter } from "node:events";
import { Vec3 } from "vec3";

const coordinateKey = ({ x, y, z }) => `${x}:${y}:${z}`;

export const createWritableMineflayerBot = (options = {}) => {
  const bot = new EventEmitter();
  const blocks = new Map();
  const inventoryItems = options.items ?? [];
  bot.game = { dimension: "overworld" };
  bot.entity = { position: new Vec3(0, 64, 0) };
  bot.inventory = { items: () => inventoryItems };
  bot.pathfinder = {
    setMovements() {},
    async goto() {},
    stop() {},
  };
  bot.loadPlugin = (plugin) => plugin(bot);
  bot.waitForChunksToLoad = async () => undefined;
  bot.quit = (reason) => bot.emit("end", reason);
  bot.end = (reason) => bot.emit("end", reason);

  const setBlock = (position, name) => {
    blocks.set(coordinateKey(position), name);
  };
  const blockNameAt = (position) =>
    blocks.get(coordinateKey(position)) ?? "air";

  bot.blockAt = (position) => {
    if (options.unloaded?.some((value) => coordinateKey(value) === coordinateKey(position))) {
      return null;
    }
    const name = blockNameAt(position);
    return {
      name,
      boundingBox: ["air", "cave_air", "void_air"].includes(name) ? "empty" : "block",
      position: new Vec3(position.x, position.y, position.z),
    };
  };
  bot.equip = async (item, destination) => {
    bot.equipped = { item, destination };
    bot.heldItem = item;
  };
  bot.canDigBlock = (block) =>
    options.canDigBlock ? options.canDigBlock(block) : true;
  bot.dig = async (block, forceLook, digFace) => {
    bot.digCall = { block, forceLook, digFace };
    if (options.onDig) {
      await options.onDig({ bot, block, setBlock });
      return;
    }
    setBlock(block.position, "air");
  };
  bot.placeBlock = async (referenceBlock, faceVector) => {
    bot.placeCall = { referenceBlock, faceVector };
    if (options.onPlace) {
      await options.onPlace({ bot, referenceBlock, faceVector, setBlock });
      return;
    }
    setBlock(referenceBlock.position.plus(faceVector), bot.heldItem.name);
  };

  return { bot, blocks, setBlock, blockNameAt };
};
