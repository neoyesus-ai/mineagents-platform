# Dashboard operativo

El dashboard mínimo ofrece una vista de sólo lectura del coordinator. No accede a SQLite, no modifica tareas y no se conecta a Minecraft.

## Rutas

- `GET /`: panel HTML con métricas, tareas recientes y agentes.
- `GET /health`: estado del proceso del dashboard.
- `GET /metrics`: contadores y duración HTTP en formato Prometheus.
- `GET /api/snapshot`: agregado JSON validado de las rutas públicas del coordinator.

Todos los demás métodos se rechazan con `405`. Si el coordinator no responde o entrega datos incompatibles, el panel y el snapshot responden `502` sin reutilizar datos potencialmente obsoletos.

## Configuración

- `DASHBOARD_PORT`: puerto HTTP; valor predeterminado `3001`.
- `COORDINATOR_URL`: URL HTTP o HTTPS del coordinator; valor predeterminado `http://127.0.0.1:3000`.
- `DASHBOARD_REFRESH_SECONDS`: intervalo de recarga entre 5 y 3600 segundos; valor predeterminado `10`.

`COORDINATOR_URL` rechaza credenciales embebidas, parámetros de consulta, fragmentos y protocolos distintos de HTTP(S).

## Ejecución local

```bash
npm run build --workspace @mineagents/dashboard
COORDINATOR_URL=http://127.0.0.1:3000 npm run start --workspace @mineagents/dashboard
```

## Docker Compose

```bash
docker compose up --build
```

El navegador accede a `http://localhost:3001`. Dentro de Compose, el dashboard usa `http://coordinator:3000`; el coordinator conserva sus datos en el volumen `coordinator-data`.

## Seguridad y límites

- El dashboard sólo emite solicitudes `GET` al coordinator.
- Todo dato dinámico se escapa antes de insertarse en HTML.
- Las páginas incluyen CSP restrictiva, `no-store`, protección contra framing y `nosniff`.
- La interfaz no contiene JavaScript cliente ni formularios.
- Se muestran como máximo 50 tareas y 12 agentes, aunque las métricas cuentan el snapshot completo.

Autenticación, paginación del coordinator, streaming, acciones operativas y control de acceso quedan fuera de este incremento.
