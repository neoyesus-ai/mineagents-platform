# Blueprints v1

Un blueprint describe qué bloques forman una estructura, pero no autoriza ni ejecuta cambios en Minecraft. El formato es JSON y usa coordenadas relativas cuyo origen `(0, 0, 0)` corresponde a la posición absoluta entregada a `compileBlueprint`.

## Esquema

```json
{
  "schemaVersion": 1,
  "id": "starter/shelter",
  "size": {
    "width": 3,
    "height": 2,
    "depth": 4
  },
  "palette": {
    "stone": "minecraft:cobblestone",
    "wood": "minecraft:oak_planks"
  },
  "blocks": [
    {
      "position": { "x": 0, "y": 0, "z": 0 },
      "material": "stone"
    },
    {
      "position": { "x": 2, "y": 1, "z": 3 },
      "material": "wood"
    }
  ]
}
```

- `schemaVersion` debe ser exactamente `1`.
- `id` es un identificador estable en minúsculas de hasta 64 caracteres.
- `size` declara límites exclusivos: `0 <= x < width`, `0 <= y < height` y `0 <= z < depth`.
- `palette` relaciona nombres locales con identificadores namespaced de Minecraft.
- `blocks` conserva el orden de colocación y no permite repetir una posición.

Los bloques de aire se rechazan porque un blueprint v1 sólo expresa colocaciones; nunca representa borrados. También se rechazan campos desconocidos para evitar que una versión anterior ignore instrucciones que no comprende.

## Límites predeterminados

- 256 bloques por plano.
- 64 entradas de paleta.
- 64 bloques por eje.

Los límites pueden reducirse o ampliarse explícitamente al validar, siempre con enteros positivos seguros. El builder mantiene sus propios límites y vuelve a validar las colocaciones antes de actuar.

## Compilación

`parseBlueprint(input)` valida datos desconocidos y devuelve una copia normalizada. `compileBlueprint(input, origin)` suma cada coordenada relativa al origen absoluto y devuelve:

- `blueprintId`.
- `placements`, compatibles con `BuildRequest`.
- `requiredRegion`, el límite mínimo que contiene todas las colocaciones.

El consumidor sigue siendo responsable de obtener una autorización `place-block` para esa región, verificar la política de bloques y entregar la solicitud al builder. La compilación falla si alguna suma deja de ser un entero seguro.

Rotaciones, espejado, estados de bloque, entidades, inventario y planificación automática quedan fuera de la versión 1.
