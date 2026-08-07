# MineAgents Platform

MineAgents Platform es una plataforma modular para coordinar agentes autónomos y colaborativos orientados a Minecraft Java Edition. El repositorio está organizado como un monorepo TypeScript para que cada servicio pueda evolucionar sin acoplarse al resto.

## Qué es

La idea central es separar responsabilidades: un coordinator administra tareas y proyectos, los agentes ejecutan trabajo especializado, el planner organizará estrategias de alto nivel, memory conservará contexto, y dashboard muestra el estado operativo. La base actual incluye el coordinator persistente, contratos compartidos, observabilidad HTTP, acceso seguro simulable a Minecraft, agentes acotados, blueprints validados y un dashboard de sólo lectura; planner y memory siguen siendo base arquitectónica.

## Visión multiagente

La visión es que varios agentes especializados colaboren sobre un mismo proyecto sin competir por el control del sistema.

- El coordinator asigna y supervisa tareas.
- El agent collector ejecuta recolecciones acotadas sobre posiciones autorizadas.
- El agent builder ejecuta colocaciones explícitas sin reemplazar bloques existentes.
- El agent explorer inspeccionará zonas y contexto.
- El SDK comparte contratos, parsers y reglas del ciclo de tareas.
- El dashboard presenta el estado público del coordinator sin exponer escrituras.
- Blueprints ya valida y compila planos; planner y memory aportarán planificación y memoria sin mezclar responsabilidades.

La plataforma prioriza supervisión humana, trazabilidad y seguridad del mundo. Docker Compose incluye un servidor Vanilla 1.21.11 con un mundo desechable separado y un observador Mineflayer que no recibe órdenes. El driver real ya admite movimiento acotado, pero todavía no hay escrituras reales ni integración con LLM.

## Arquitectura prevista

- `coordinator/`: API REST, agentes, proyectos, tareas y persistencia SQLite.
- `sdk/`: contratos públicos y utilidades compartidas para agentes.
- `observability/`: logs JSON y métricas HTTP compartidas.
- `minecraft-adapter/`: acceso seguro y simulable a capacidades de Minecraft.
- `minecraft-driver-mineflayer/`: conexión real, movimiento acotado y heartbeat del observador.
- `agents/collector/`: agente recolector.
- `agents/builder/`: agente constructor.
- `agents/explorer/`: agente explorador.
- `agents/common/`: piezas compartidas entre agentes.
- `planner/`: planificación de alto nivel.
- `memory/`: persistencia y memoria compartida.
- `dashboard/`: panel operativo de sólo lectura.
- `blueprints/`: formato versionado, validación y compilación de planos.
- `docs/`: visión, arquitectura y roadmap.
- `scripts/`: automatizaciones del monorepo.
- `tests/`: pruebas transversales.

## Coordinator v1

El servicio `coordinator` expone una API mínima sobre SQLite con estas rutas:

- `GET /health`
- `GET /metrics`
- `GET /agents`
- `POST /agents/heartbeat`
- `GET /tasks`
- `POST /tasks`
- `POST /tasks/claim`
- `PATCH /tasks/:id`
- `GET /projects`
- `POST /projects`

Entidades implementadas:

- `Agent`
- `Task`
- `Project`

Estados de tarea soportados:

- `pending`
- `assigned`
- `running`
- `completed`
- `failed`
- `cancelled`

Las transiciones válidas son `pending → assigned → running → completed`, con salidas controladas a `failed` o `cancelled`. Los estados terminales no pueden reabrirse.

## SDK v1

`@mineagents/sdk` publica:

- Registros e inputs de agentes, proyectos y tareas.
- Listas de estados y type guards.
- Parsers que normalizan y validan datos desconocidos.
- Reglas compartidas de transición y estados terminales.

El SDK es independiente de HTTP, SQLite y Minecraft. El coordinator lo consume como dependencia de workspace y mantiene temporalmente sus exportaciones de dominio anteriores.

## Adaptador seguro de Minecraft

`@mineagents/minecraft-adapter` define una interfaz independiente del cliente real y un guardián que aplica regiones permitidas, límites de movimiento, listas de bloques y autorizaciones externas con caducidad y cuota. `createReadOnlyMinecraftPolicy` desactiva movimiento y escrituras por defecto.

`@mineagents/mineflayer-driver` conecta un observador real al servidor 1.21.11, expone estado e inspección de bloques cargados y registra heartbeats en el coordinator. Su movimiento usa pathfinding con regiones explícitas, timeout, vigilancia en ejecución y un perfil que impide excavar, colocar, abrir puertas o usar andamiaje. La colocación y rotura de bloques siguen rechazadas.

El contenedor `mineflayer-observer` usa una identidad offline de desarrollo y se conecta exclusivamente al servicio `minecraft` de Compose.

## Agente recolector

`@mineagents/agent-collector` valida solicitudes con posiciones candidatas explícitas, inspecciona primero y sólo rompe coincidencias exactas mediante el adaptador seguro. Ante escasez no modifica nada, salvo que se solicite trabajo parcial de forma expresa.

La cancelación y los fallos conservan el progreso realizado para evitar reintentos ciegos. El resultado representa bloques rotos, no materiales confirmados en inventario; tampoco hay todavía polling del coordinator ni conexión a Minecraft.

## Agente constructor

`@mineagents/agent-builder` valida y deduplica colocaciones absolutas, inspecciona todos los destinos y omite bloques ya correctos. Sólo coloca sobre aire; cualquier bloque distinto detiene la tarea sin escrituras, salvo que se solicite trabajo parcial explícitamente.

El resultado conserva las posiciones colocadas ante cancelaciones o fallos. El builder todavía no interpreta blueprints, verifica inventario ni consume tareas del coordinator.

## Blueprints v1

`@mineagents/blueprints` define un formato JSON estricto con identificador, dimensiones, paleta de bloques y posiciones relativas. Rechaza campos desconocidos, aire, referencias inexistentes, posiciones duplicadas, coordenadas fuera de rango y planos que superen los límites configurados.

`compileBlueprint` traslada un plano validado a colocaciones absolutas compatibles con el builder y calcula la región mínima requerida para solicitar autorización. El módulo no crea autorizaciones, no decide dónde construir y no accede a Minecraft. El esquema completo está en [docs/blueprints.md](docs/blueprints.md).

## Dashboard mínimo

`@mineagents/dashboard` consulta únicamente `GET /health`, `/agents`, `/tasks` y `/projects` del coordinator. Renderiza métricas, tareas recientes y agentes registrados en HTML sin JavaScript cliente, valida las respuestas del servicio y escapa todo contenido dinámico.

El dashboard publica `GET /`, `GET /health`, `GET /metrics` y `GET /api/snapshot`. Cualquier método distinto de `GET` se rechaza, y una caída del coordinator produce una respuesta controlada sin mostrar datos obsoletos. La configuración y operación se documentan en [docs/dashboard.md](docs/dashboard.md).

## Observabilidad

Coordinator y dashboard exponen métricas Prometheus en `GET /metrics` y generan un `X-Request-Id` por respuesta. Los procesos iniciados mediante sus CLI escriben un registro JSON por request con servicio, evento, método, ruta normalizada, estado y duración.

Las métricas no usan URLs ni IDs dinámicos como etiquetas. Tampoco se registran cuerpos, parámetros de consulta, autorizaciones o contenido de tareas. El contrato completo está en [docs/observability.md](docs/observability.md).

## Instalación

```bash
npm install
cp .env.example .env
```

## Ejecución local del coordinator

```bash
npm run build --workspace @mineagents/coordinator
npm run start --workspace @mineagents/coordinator
```

Por defecto escucha en `3000` y usa `./data/coordinator.sqlite`.

## Ejecución local del dashboard

Con el coordinator activo:

```bash
npm run build --workspace @mineagents/dashboard
COORDINATOR_URL=http://127.0.0.1:3000 npm run start --workspace @mineagents/dashboard
```

Por defecto el dashboard escucha en `3001` y actualiza la vista cada 10 segundos.

## Validaciones

```bash
npm run build
npm run test
npm run lint
npm run typecheck
```

- `build` compila todos los workspaces con salida definida.
- `test` compila primero y luego ejecuta las pruebas del repositorio.
- `lint` aplica las reglas estáticas.
- `typecheck` verifica tipos sin emitir archivos.

## Docker Compose

`docker-compose.yml` integra el coordinator, su volumen SQLite, el dashboard de sólo lectura y un servidor Minecraft Java Edition 1.21.11 para desarrollo. El servidor crea un mundo independiente llamado `mineagents-demo`; no monta ni modifica mundos existentes.

```bash
docker compose up --build
```

Servicios disponibles:

- Minecraft Java 1.21.11: `127.0.0.1:25565` desde el host y `minecraft:25565` desde otros contenedores.
- Coordinator: `http://127.0.0.1:3000`.
- Dashboard: `http://127.0.0.1:3001`.

Todos los puertos se limitan a loopback. El servidor usa modo creativo, dificultad pacífica y `online-mode` desactivado exclusivamente para identidades locales de prueba. La configuración de Minecraft está en [docs/minecraft-server.md](docs/minecraft-server.md); el procedimiento operativo completo está en [docs/deployment.md](docs/deployment.md).


## Roadmap inicial

1. Consolidar el monorepo y la documentación base.
2. Terminar contratos del SDK y de tareas compartidas.
3. Evolucionar la cola persistente y el manejo de progreso.
4. Implementar los agentes recolector y constructor sobre límites seguros.
5. Validar el movimiento acotado y añadir escrituras autorizadas sobre el mundo desechable.
6. Crear dashboard, métricas y despliegue reproducible.

Fuera del MVP inicial quedan la integración con LLM, la economía entre agentes, las personalidades complejas y la búsqueda de imágenes.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Dashboard](docs/dashboard.md)
- [Despliegue, respaldo y recuperación](docs/deployment.md)
- [Flujo integral simulado del MVP](docs/mvp-flow.md)
- [Observabilidad](docs/observability.md)
- [Servidor Minecraft de desarrollo](docs/minecraft-server.md)
- [Visión](docs/vision.md)
- [Roadmap](docs/roadmap.md)

## Licencia

Este proyecto se distribuye bajo la licencia MIT.
