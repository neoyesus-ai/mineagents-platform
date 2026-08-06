# ADR 0001 — El SDK es el límite de contratos públicos

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

La primera versión del coordinator definía internamente los modelos de agentes, proyectos y tareas, además de validar los cuerpos de la API. Esto obligaba a futuros agentes a depender de detalles del servicio o a duplicar contratos.

## Decisión

`@mineagents/sdk` es la fuente única de tipos, estados, parsers de entrada y reglas de transición compartidas. El SDK se divide por dominio (`agents`, `projects` y `tasks`) y no importa código del coordinator ni adaptadores de Minecraft.

El coordinator depende del SDK y traduce `ContractValidationError` a su error HTTP 400. Sus módulos conservan persistencia, transporte HTTP y errores propios. `coordinator/src/domain.ts` reexporta temporalmente el SDK para mantener compatibles las importaciones públicas de la versión 0.1.

Las transiciones permitidas son:

- `pending` → `assigned` o `cancelled`.
- `assigned` → `pending`, `running`, `failed` o `cancelled`.
- `running` → `completed`, `failed` o `cancelled`.
- `completed`, `failed` y `cancelled` son terminales.
- Repetir el estado actual es una operación válida e idempotente.

Los cambios incompatibles en estos contratos requerirán una nueva versión del SDK y una actualización coordinada de sus consumidores.

## Consecuencias

- Los agentes podrán validar datos y compartir tipos sin importar el coordinator.
- La API y la persistencia aplican la misma máquina de estados.
- El SDK se compila antes que sus consumidores.
- Los detalles de SQLite, HTTP, Minecraft y ejecución de agentes quedan fuera del SDK.
