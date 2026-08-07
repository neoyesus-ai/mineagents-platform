# Despliegue, respaldo y recuperación

Esta guía cubre el entorno reproducible de desarrollo y pruebas del MVP. No es un despliegue público: Minecraft usa autenticación offline y coordinator y dashboard no implementan autenticación de usuarios ni TLS.

## Requisitos

- Docker Engine con Docker Compose v2.
- Al menos 2 GiB de memoria disponibles para Minecraft, además de los servicios Node.js.
- Puertos locales 25565, 3000 y 3001 libres, o valores alternativos en `.env`.

## Preparación y arranque

```bash
cp .env.example .env
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Los tres puertos publicados quedan ligados a `127.0.0.1`. No deben cambiarse a `0.0.0.0` mientras Minecraft use `ONLINE_MODE=FALSE` o las APIs carezcan de autenticación.

Comprobaciones mínimas tras el arranque:

```bash
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3001/health
docker compose ps minecraft
```

El estado persistente reside en dos volúmenes:

- `COORDINATOR_DATA_VOLUME`: SQLite del coordinator, por defecto `mineagents-platform_coordinator-data`.
- `MINECRAFT_DATA_VOLUME`: mundo desechable, por defecto `mineagents-platform_minecraft-demo-data`.

`docker compose down` conserva ambos volúmenes. No usar `docker compose down --volumes` si deben conservarse.

## Actualización

Antes de cambiar una imagen, dependencia o versión de Minecraft:

1. Ejecutar `npm run test`, `npm run lint` y `npm run typecheck`.
2. Crear un respaldo consistente.
3. Ejecutar `docker compose build` y `docker compose up -d`.
4. Repetir las comprobaciones de salud y revisar `docker compose logs --tail=200`.

Un cambio de `MINECRAFT_VERSION` requiere una copia independiente del mundo y una prueba previa en un volumen restaurado.

## Respaldo consistente

Detener los servicios fuerza el cierre de SQLite y del servidor Minecraft antes de leer sus volúmenes:

```bash
MINEAGENTS_BACKUP_DIR="$PWD/../mineagents-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$MINEAGENTS_BACKUP_DIR"
docker compose stop
docker run --rm --volume mineagents-platform_coordinator-data:/source:ro --volume "$MINEAGENTS_BACKUP_DIR:/backup" alpine:3.22 tar -czf /backup/coordinator-data.tar.gz -C /source .
docker run --rm --volume mineagents-platform_minecraft-demo-data:/source:ro --volume "$MINEAGENTS_BACKUP_DIR:/backup" alpine:3.22 tar -czf /backup/minecraft-data.tar.gz -C /source .
(cd "$MINEAGENTS_BACKUP_DIR" && sha256sum *.tar.gz > SHA256SUMS)
docker compose up -d
```

Si `.env` cambia los nombres de los volúmenes, sustituirlos en los dos comandos `docker run`. Los archivos de respaldo deben almacenarse fuera del repositorio y fuera de los propios volúmenes.

Verificar el respaldo sin extraerlo:

```bash
MINEAGENTS_BACKUP_DIR=/ruta/absoluta/al/respaldo
(cd "$MINEAGENTS_BACKUP_DIR" && sha256sum --check SHA256SUMS)
tar -tzf "$MINEAGENTS_BACKUP_DIR/coordinator-data.tar.gz" >/dev/null
tar -tzf "$MINEAGENTS_BACKUP_DIR/minecraft-data.tar.gz" >/dev/null
```

## Recuperación sin sobrescribir el origen

La recuperación se realiza en volúmenes nuevos. Así se conserva el estado anterior para un rollback:

```bash
MINEAGENTS_BACKUP_DIR=/ruta/absoluta/al/respaldo
docker compose stop
docker volume create mineagents-restore-coordinator
docker volume create mineagents-restore-minecraft
docker run --rm --volume mineagents-restore-coordinator:/target --volume "$MINEAGENTS_BACKUP_DIR:/backup:ro" alpine:3.22 tar -xzf /backup/coordinator-data.tar.gz -C /target
docker run --rm --volume mineagents-restore-minecraft:/target --volume "$MINEAGENTS_BACKUP_DIR:/backup:ro" alpine:3.22 tar -xzf /backup/minecraft-data.tar.gz -C /target
```

Configurar después en `.env`:

```dotenv
COORDINATOR_DATA_VOLUME=mineagents-restore-coordinator
MINECRAFT_DATA_VOLUME=mineagents-restore-minecraft
```

Arrancar y verificar:

```bash
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3001/health
```

Comprobar además desde el dashboard que proyectos, tareas y agentes son los esperados. El mundo restaurado sólo debe inspeccionarse; esta operación no autoriza modificaciones.

Si la verificación falla, detener Compose, restaurar en `.env` los nombres de volumen anteriores y volver a iniciar. No borrar ningún volumen hasta validar el rollback y conservar otra copia del respaldo.

## Alcance operativo

El MVP no incluye rotación automática, almacenamiento remoto, migraciones de esquema versionadas, autenticación, TLS ni alertas. Para un entorno compartido, esos puntos son requisitos previos y no deben resolverse exponiendo directamente los puertos actuales.
