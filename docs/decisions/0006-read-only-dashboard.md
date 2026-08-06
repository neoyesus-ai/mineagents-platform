# ADR 0006 — Dashboard de sólo lectura

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

La operación necesita visibilidad básica sobre proyectos, tareas y agentes. El coordinator ya expone lecturas públicas, pero el dashboard no debe acoplarse a SQLite ni ampliar accidentalmente la superficie de escritura.

## Decisión

`@mineagents/dashboard` será un servicio Node.js independiente que consume exclusivamente las rutas `GET` del coordinator. Construye un snapshot validado y renderiza HTML en el servidor, sin JavaScript cliente ni formularios.

- El dashboard no importa la implementación del coordinator ni abre su base de datos.
- Los contratos de estado se comparten desde `@mineagents/sdk`.
- Las respuestas HTTP se validan en el límite del cliente.
- El contenido dinámico se escapa y se sirve con cabeceras restrictivas.
- Los métodos distintos de `GET` se rechazan antes de consultar el coordinator.
- Los fallos del coordinator producen un estado explícito y no datos almacenados silenciosamente.

## Consecuencias

- El panel puede desplegarse y escalarse separado del coordinator.
- La primera versión funciona sin framework web ni pipeline de frontend.
- La recarga completa periódica prima simplicidad y trazabilidad sobre tiempo real.
- Autenticación, paginación, streaming y controles operativos requieren decisiones posteriores.
