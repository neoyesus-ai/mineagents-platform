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

Esta prueba valida conexión, inspección y movimiento reales. El flujo lógico de collector y builder ya se prueba de extremo a extremo en memoria; la fase 3 sigue abierta hasta validar escrituras autorizadas en este servidor desechable.

La presencia del servidor no concede permisos de escritura. El driver implementa colocación y rotura con precondiciones defensivas, pero el observer no recibe órdenes. Toda acción que modifique bloques debe atravesar `SafeMinecraftAdapter` con política limitada y autorización externa.

## Seguridad y persistencia

`online-mode` está desactivado para que los agentes locales puedan usar identidades de prueba sin credenciales. Por ese motivo el puerto se publica exclusivamente en loopback y no debe cambiarse a `0.0.0.0` en una máquina accesible desde otras redes.

El mundo de demostración persiste en el volumen `minecraft-demo-data`. `docker compose down` detiene los servicios sin borrar el mundo. No usar `docker compose down --volumes` si se quiere conservarlo.
