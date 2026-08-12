import {
  EventEmitter,
} from "node:events";

import {
  Vec3,
} from "vec3";

const coordinateKey = ({
  x,
  y,
  z,
}) =>
  `${x}:${y}:${z}`;

const cloneInventoryItem = (
  item,
) => ({
  ...item,
});

export const createWritableMineflayerBot = (
  options = {},
) => {
  const bot =
    new EventEmitter();

  const blocks =
    new Map();

  /*
   * Inventario mutable.
   *
   * Hasta ahora el harness devolvía siempre
   * el mismo array. Para probar handoff
   * necesitamos que toss() pueda disminuir
   * cantidades realmente.
   */
  const inventoryItems =
    (
      options.items ??
      []
    ).map(
      cloneInventoryItem,
    );

  bot.game = {
    dimension:
      "overworld",
  };

  bot.entity = {
    position:
      new Vec3(
        0,
        64,
        0,
      ),
  };

  bot.inventory = {
    items:
      () =>
        inventoryItems
          .filter(
            (
              item,
            ) =>
              item.count >
              0,
          ),
  };

  bot.pathfinder = {
    setMovements() {},

    async goto() {},

    stop() {},
  };

  bot.loadPlugin = (
    plugin,
  ) =>
    plugin(
      bot,
    );

  bot.waitForChunksToLoad =
    async () =>
      undefined;

  bot.quit = (
    reason,
  ) =>
    bot.emit(
      "end",
      reason,
    );

  bot.end = (
    reason,
  ) =>
    bot.emit(
      "end",
      reason,
    );

  const setBlock = (
    position,
    name,
  ) => {
    blocks.set(
      coordinateKey(
        position,
      ),
      name,
    );
  };

  const blockNameAt = (
    position,
  ) =>
    blocks.get(
      coordinateKey(
        position,
      ),
    ) ??
    "air";

  bot.blockAt = (
    position,
  ) => {
    if (
      options.unloaded
        ?.some(
          (
            value,
          ) =>
            coordinateKey(
              value,
            ) ===
            coordinateKey(
              position,
            ),
        )
    ) {
      return null;
    }

    const name =
      blockNameAt(
        position,
      );

    return {
      name,

      boundingBox:
        [
          "air",
          "cave_air",
          "void_air",
        ].includes(
          name,
        )
          ? "empty"
          : "block",

      position:
        new Vec3(
          position.x,
          position.y,
          position.z,
        ),
    };
  };

  bot.equip =
    async (
      item,
      destination,
    ) => {
      bot.equipped = {
        item,
        destination,
      };

      bot.heldItem =
        item;
    };

  bot.canDigBlock = (
    block,
  ) =>
    options.canDigBlock
      ? options.canDigBlock(
          block,
        )
      : true;

  bot.dig =
    async (
      block,
      forceLook,
      digFace,
    ) => {
      bot.digCall = {
        block,
        forceLook,
        digFace,
      };

      if (
        options.onDig
      ) {
        await options.onDig({
          bot,
          block,
          setBlock,
        });

        return;
      }

      setBlock(
        block.position,
        "air",
      );
    };

  bot.placeBlock =
    async (
      referenceBlock,
      faceVector,
    ) => {
      bot.placeCall = {
        referenceBlock,
        faceVector,
      };

      if (
        options.onPlace
      ) {
        await options.onPlace({
          bot,
          referenceBlock,
          faceVector,
          setBlock,
        });

        return;
      }

      setBlock(
        referenceBlock
          .position
          .plus(
            faceVector,
          ),

        bot.heldItem
          .name,
      );
    };

  /*
   * Implementación de toss para tests.
   *
   * Mineflayer recibe:
   *
   *   type
   *   metadata
   *   count
   *
   * y descuenta esa cantidad del inventario.
   */
  bot.toss =
    async (
      type,
      metadata,
      count,
    ) => {
      bot.tossCall = {
        type,
        metadata,
        count,
      };

      if (
        options.onToss
      ) {
        await options.onToss({
          bot,
          type,
          metadata,
          count,
          inventoryItems,
        });

        return;
      }

      let remaining =
        count;

      for (
        const item
        of inventoryItems
      ) {
        if (
          remaining <=
          0
        ) {
          break;
        }

        if (
          item.type !==
          type
        ) {
          continue;
        }

        /*
         * null significa "sin metadata
         * específica" para nuestros tests.
         */
        if (
          metadata !==
            null &&
          item.metadata !==
            metadata
        ) {
          continue;
        }

        const removed =
          Math.min(
            item.count,
            remaining,
          );

        item.count -=
          removed;

        remaining -=
          removed;
      }

      if (
        remaining >
        0
      ) {
        throw new Error(
          "Harness inventory does not contain enough matching items.",
        );
      }
    };

  const inventoryCount = (
    itemName,
  ) =>
    inventoryItems
      .filter(
        (
          item,
        ) =>
          item.name ===
          itemName,
      )
      .reduce(
        (
          total,
          item,
        ) =>
          total +
          item.count,

        0,
      );

  return {
    bot,
    blocks,
    inventoryItems,
    setBlock,
    blockNameAt,
    inventoryCount,
  };
};