# ADR 0007 — Observabilidad HTTP con cardinalidad acotada

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

Coordinator y dashboard necesitan señales operativas sin introducir servicios externos ni convertir IDs de tareas, URLs arbitrarias o contenido de usuarios en etiquetas costosas o datos sensibles.

## Decisión

Se crea `@mineagents/observability` como biblioteca común y sin dependencias de dominio. Proporciona un logger JSON inyectable y un registro de métricas HTTP en memoria con salida Prometheus.

Cada servicio es responsable de traducir el path recibido a un conjunto finito de rutas conocidas antes de observarlo. Las rutas dinámicas usan plantillas y cualquier ruta desconocida se agrupa como `unmatched`.

- Cada respuesta recibe un request ID generado por el servicio.
- Los access logs sólo contienen método, ruta normalizada, estado y duración.
- No se registran bodies, queries, autorizaciones ni contenido de dominio.
- Los campos reservados del logger no pueden ser reemplazados por campos adicionales.
- Los servidores usados como bibliotecas son silenciosos por defecto; sus CLI activan stdout JSON.

## Consecuencias

- Las métricas pueden ser recolectadas por Prometheus sin una dependencia runtime adicional.
- Reiniciar un proceso reinicia sus contadores.
- Los request IDs todavía no se propagan entre dashboard y coordinator.
- Persistencia, alertas, agregación y trazas distribuidas quedan para una fase posterior.
