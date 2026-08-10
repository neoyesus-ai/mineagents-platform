# Servidor Minecraft de desarrollo

Docker Compose incluye un servidor Vanilla para probar posteriormente la conexión de los agentes sin usar ningún mundo existente.

## Configuración fijada

- Minecraft Java Edition: `1.21.11`.
- Java de la imagen: `21`.
- Tipo de servidor: Vanilla.
- Mundo: `mineagents-demo` en el volumen `minecraft-demo-data`.
- Juego: creativo, dificultad pacífica.
- Red desde el host: `127.0.0.1:25565`.
- Red desde Compose: `minecraft:25565`.
- RCON y command blocks: desactivados.

La versión puede cambiarse de forma explícita mediante `MINECRAFT_VERSION`, aunque la versión predeterminada es la referencia de compatibilidad del driver Mineflayer.

## Arranque

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

El primer arranque descarga el servidor seleccionado y genera un mundo nuevo, por lo que puede tardar varios minutos. El estado `healthy` indica que acepta conexiones.

Para seguir el arranque:

```bash
docker compose logs -f minecraft
```

Para conectarse con Minecraft Java Edition, añadir un servidor con dirección `127.0.0.1:25565` y usar la versión 1.21.11 del cliente.

## Conexión de agentes

El servicio `mineflayer-observer` se inicia después del healthcheck de Minecraft, entra como `MineObserver` y envía un heartbeat al coordinator cada 15 segundos. No se mueve ni puede modificar bloques.

Un agente ejecutado como servicio de este Compose debe usar:

```text
host: minecraft
port: 25565
version: 1.21.11
```

Un agente ejecutado directamente en el host debe usar `127.0.0.1` y el puerto configurado por `MINECRAFT_PORT`.

## Smoke test de movimiento

Con el servidor desechable sano, compilar el driver y ejecutar:

```bash
npm run build --workspace @mineagents/mineflayer-driver
MINECRAFT_HOST=127.0.0.1 \
MINECRAFT_PORT=25565 \
MINECRAFT_USERNAME=MineSmoke \
npm run smoke:movement --workspace @mineagents/mineflayer-driver
```

La prueba usa una identidad efímera, encuentra un destino transitable cerca del spawn, se desplaza dentro de una región acotada y regresa al origen. Compara los bloques del origen y del destino antes y después; cualquier cambio de bloque hace fallar el proceso.

La ejecución verificada alcanzó el destino al primer intento, regresó exactamente al origen y produjo `blocksUnchanged: true`. El servidor permaneció sano y el observador se reconectó correctamente tras reconstruir su imagen.

Esta prueba valida conexión, inspección y movimiento reales.

La presencia del servidor no concede permisos de escritura. El driver implementa colocación y rotura con precondiciones defensivas, pero el observer no recibe órdenes. Toda acción que modifique bloques debe atravesar `SafeMinecraftAdapter` con política limitada y autorización externa.

## Smoke test supervisado de agentes

`smoke:agents` rompe y repone un único bloque mediante collector y builder. Es una operación manual que sólo debe usarse en un mundo desechable dedicado y requiere aprobación humana para cada ejecución.

Antes de ejecutarla:

1. Seleccionar y verificar manualmente una coordenada del mundo desechable.
2. Confirmar el identificador exacto del bloque observado.
3. Provisionar en el inventario de la identidad de prueba al menos un bloque idéntico para garantizar la recuperación.
4. Compilar adapter, collector, builder y driver.

```bash
npm run build --workspace @mineagents/minecraft-adapter
npm run build --workspace @mineagents/agent-collector
npm run build --workspace @mineagents/agent-builder
npm run build --workspace @mineagents/mineflayer-driver

MINECRAFT_HOST=127.0.0.1 \
MINECRAFT_PORT=25665 \
MINECRAFT_VERSION=1.21.11 \
MINECRAFT_USERNAME=MineAgentSmoke \
MINECRAFT_AGENT_SMOKE_APPROVAL=I_APPROVE_REVERSIBLE_WRITES_TO_A_DISPOSABLE_WORLD \
MINECRAFT_AGENT_SMOKE_TARGET=8,-61,-7 \
MINECRAFT_AGENT_SMOKE_BLOCK=minecraft:grass_block \
npm run smoke:agents --workspace @mineagents/mineflayer-driver
```

Los valores anteriores documentan la ejecución verificada y no son coordenadas predeterminadas. Cada entorno debe aportar su propio destino inspeccionado. Sin la frase exacta, coordenadas, bloque o inventario de reposición, el proceso falla antes de escribir.

La política generada desactiva movimiento y contiene una sola coordenada. Collector dispone de una autorización para romper; builder puede usar como máximo dos autorizaciones independientes y vuelve a inspeccionar antes del segundo intento. Una autorización adicional sólo permite recuperar el mismo bloque sobre aire. Nunca se reemplaza un bloque inesperado.

La ejecución real del 7 de agosto de 2026 usó Minecraft 1.21.11, `127.0.0.1:25665` y un volumen exclusivo. Produjo:

```text
collector.status: completed
collector.brokenBlocks: 1
builder.status: completed
builder.placedBlocks: 1
builderAttempts: 2
restored: true
```

Una conexión independiente confirmó después `minecraft:grass_block` sólido en `(8,-61,-7)`. El contenedor aislado se detuvo limpiamente y su volumen se conservó. La decisión y los límites completos están en [ADR 0013](decisions/0013-supervised-agent-world-smoke.md).

## Seguridad y persistencia

`online-mode` está desactivado para que los agentes locales puedan usar identidades de prueba sin credenciales. Por ese motivo el puerto se publica exclusivamente en loopback y no debe cambiarse a `0.0.0.0` en una máquina accesible desde otras redes.

El mundo de demostración persiste en el volumen `minecraft-demo-data`. `docker compose down` detiene los servicios sin borrar el mundo. No usar `docker compose down --volumes` si se quiere conservarlo.
