# ADR 0004 — Constructor idempotente con preflight completo

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

El agente constructor debe colocar bloques sin sobrescribir el mundo ni asumir que una tarea empieza desde cero. El formato de planos todavía no está definido y no existe un driver real de Minecraft.

## Decisión

`@mineagents/agent-builder` recibe `BuildRequest` con colocaciones absolutas explícitas y una autorización `place-block` ligada a la misma tarea.

Antes de escribir, valida y deduplica toda la solicitud, rechaza tipos distintos para una misma posición e inspecciona todos los destinos. Cada destino se clasifica como ya satisfecho, vacío o bloqueado por otro bloque.

- Los bloques ya correctos se omiten, haciendo idempotentes los reintentos.
- Sólo `air`, `cave_air` y `void_air` se consideran destinos vacíos.
- Un destino ocupado nunca se reemplaza implícitamente.
- Si existe un bloqueo, no se coloca nada por defecto.
- `allowPartial` debe ser explícito para colocar únicamente los destinos vacíos.
- Cancelaciones y fallos conservan un resultado parcial con las posiciones ya colocadas.

## Consecuencias

- El builder no rompe bloques, calcula estructuras ni decide materiales.
- Un futuro módulo de blueprints producirá colocaciones para este contrato sin controlar Minecraft.
- Toda colocación sigue pasando por `MinecraftAdapter` y su verificador externo.
- La disponibilidad de materiales, navegación y soportes de colocación quedan a cargo de futuras capas y del driver.
- Las pruebas usan un adaptador simulado y no acceden a ningún mundo.
