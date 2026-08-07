# ADR 0008: servidor Minecraft desechable y versionado

## Estado

Aceptada.

## Contexto

El adaptador y los agentes se prueban actualmente con drivers simulados. Para implementar y observar un driver real hace falta un destino reproducible que no dependa de mundos del usuario ni permita conexiones de red no previstas.

## Decisión

Docker Compose ejecutará Minecraft Java Edition 1.21.11 Vanilla sobre una imagen Java 21 versionada. Creará el mundo `mineagents-demo` en un volumen Docker exclusivo y publicará el protocolo únicamente en `127.0.0.1:25565`.

Los servicios del mismo Compose usarán el nombre interno `minecraft` y el puerto `25565`. `online-mode` permanecerá desactivado sólo en este entorno local para permitir identidades de agentes sin credenciales. RCON y command blocks estarán desactivados.

## Consecuencias

- Ningún mundo existente se monta ni se modifica.
- Las pruebas manuales y el futuro driver comparten una versión de protocolo explícita.
- El primer arranque necesita descargar el servidor y generar un mundo.
- El entorno no es apto para exposición pública debido a `online-mode=false`.
- El servidor no sustituye las políticas ni las autorizaciones de `SafeMinecraftAdapter`.
