# Dashboard operativo

El dashboard ofrece supervisión y un conjunto acotado de acciones operativas sobre el coordinator. No accede a SQLite ni se conecta directamente a Minecraft.

## Rutas

- `GET /`: panel HTML con métricas, tareas recientes y agentes.
- `GET /health`: estado del proceso del dashboard.
- `GET /metrics`: contadores y duración HTTP en formato Prometheus.
- `GET /api/snapshot`: agregado JSON validado de las rutas públicas del coordinator.
- `POST /actions/projects`: crea un proyecto desde un formulario.
- `POST /actions/tasks`: crea una tarea pendiente, asociada opcionalmente a un proyecto.
- `POST /actions/tasks/:id/cancel`: cancela una tarea activa.

Cada ruta acepta únicamente su método documentado. Si el coordinator no responde o entrega datos incompatibles, el panel y el snapshot responden `502`; una acción fallida vuelve al panel con un aviso y no se reintenta automáticamente.

## Filtros de tareas

`GET /` acepta `q` para buscar sin distinguir mayúsculas en título y descripción, `status` para uno de los estados del SDK y `projectId` para limitar el resultado a un proyecto. Los tres filtros se combinan y quedan reflejados en la URL para poder recargar o compartir la vista.

La búsqueda admite hasta 80 caracteres y el identificador de proyecto hasta 200. Valores inválidos o parámetros repetidos no activan ese filtro. El filtrado se aplica al snapshot completo antes del límite visual de 50 tareas; `GET /api/snapshot` continúa entregando el agregado sin filtrar.


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

## Flujo operativo

Los formularios permiten crear primero un proyecto y después añadir tareas a su cola. Las tareas nuevas siempre nacen en estado `pending`. El dashboard no reclama ni asigna trabajo: esa responsabilidad sigue perteneciendo a los agentes. Una tarea `pending`, `assigned` o `running` puede cancelarse desde su fila.

Después de una escritura válida, el dashboard responde con `303` y vuelve al panel para evitar reenvíos accidentales del formulario. El cliente HTTP valida la entidad devuelta por el coordinator antes de considerar la acción exitosa.

## Seguridad y límites

- Las escrituras se envían exclusivamente a la API pública del coordinator; el dashboard nunca abre su base de datos.
- Todo dato dinámico se escapa antes de insertarse en HTML.
- Las páginas incluyen CSP restrictiva con formularios limitados a `self`, `no-store`, protección contra framing y `nosniff`.
- Las acciones exigen `Origin` con el mismo host, rechazan `Sec-Fetch-Site: cross-site`, campos repetidos o desconocidos y cuerpos superiores a 16 KiB.
- La interfaz usa HTML del servidor y formularios estándar, sin JavaScript cliente.
- Se muestran como máximo 50 tareas y 12 agentes, aunque las métricas cuentan el snapshot completo.

La comprobación de origen evita solicitudes cross-site, pero no sustituye autenticación ni autorización. Mantén el puerto ligado a loopback —como hace Docker Compose— o coloca el servicio detrás de un proxy autenticado. Paginación, streaming y control de acceso por roles quedan fuera de este incremento.
