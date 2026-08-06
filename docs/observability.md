# Observabilidad HTTP

Coordinator y dashboard comparten `@mineagents/observability`, una biblioteca sin dependencias de dominio para logs JSON y métricas compatibles con Prometheus.

## Métricas

Ambos servicios publican `GET /metrics` con tipo `text/plain; version=0.0.4`.

- `mineagents_http_requests_total`: respuestas completadas por servicio, método, ruta acotada y código de estado.
- `mineagents_http_request_duration_seconds_sum`: suma de duración para cada combinación de etiquetas.
- `mineagents_http_request_duration_seconds_count`: cantidad de observaciones de duración.
- `mineagents_process_uptime_seconds`: tiempo desde que se creó el registro del servicio.

El coordinator añade:

- `mineagents_coordinator_agents`.
- `mineagents_coordinator_tasks`.
- `mineagents_coordinator_projects`.

Las rutas dinámicas se normalizan. Por ejemplo, cualquier recurso individual de tareas usa `/tasks/:id`; URLs desconocidas usan `unmatched`. Nunca se incluyen IDs, parámetros de consulta, nombres o contenido del usuario como etiquetas.

Ejemplo de scraping manual:

```bash
curl --fail http://localhost:3000/metrics
curl --fail http://localhost:3001/metrics
```

## Logs

Los CLI de coordinator y dashboard escriben objetos JSON, una línea por evento, en stdout. Los eventos de request contienen:

- `timestamp`, `level`, `service` y `event`.
- `requestId`.
- `method` y ruta normalizada.
- `statusCode`.
- `durationMs`.

Cada respuesta incluye el mismo identificador en `X-Request-Id`. No se registran cuerpos HTTP, queries, cabeceras de autorización, direcciones del mundo, nombres de proyectos ni contenido de tareas.

Los errores inesperados registran únicamente su clase y request ID; la respuesta pública conserva un mensaje genérico.

Los warnings del proceso coordinator se convierten en eventos `process.warning` para evitar líneas de texto no estructuradas en el runtime Docker.

## Límites actuales

Las métricas viven en memoria y se reinician con cada proceso. Este incremento no incluye almacenamiento de logs, Prometheus, Grafana, alertas, trazas distribuidas ni política de retención.
