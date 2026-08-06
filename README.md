# MineAgents Platform

MineAgents Platform es una plataforma modular para coordinar agentes autónomos y colaborativos orientados a Minecraft Java Edition. El repositorio está organizado como un monorepo TypeScript para que cada servicio pueda evolucionar sin acoplarse al resto.

## Qué es

La idea central es separar responsabilidades: un coordinator administra tareas y proyectos, los agentes ejecutan trabajo especializado, el planner organizará estrategias de alto nivel, memory conservará contexto, y dashboard mostrará el estado operativo. La base actual incluye el coordinator persistente, contratos compartidos, acceso seguro simulable a Minecraft, agentes acotados y blueprints validados; planner, memory y dashboard siguen siendo base arquitectónica.

## Visión multiagente

La visión es que varios agentes especializados colaboren sobre un mismo proyecto sin competir por el control del sistema.

- El coordinator asigna y supervisa tareas.
- El agent collector ejecuta recolecciones acotadas sobre posiciones autorizadas.
- El agent builder ejecuta colocaciones explícitas sin reemplazar bloques existentes.
- El agent explorer inspeccionará zonas y contexto.
- El SDK comparte contratos, parsers y reglas del ciclo de tareas.
- Blueprints ya valida y compila planos; planner y memory aportarán planificación y memoria sin mezclar responsabilidades.

La plataforma prioriza supervisión humana, trazabilidad y seguridad del mundo. Todavía no hay conexión a Minecraft, Mineflayer ni LLM.

## Arquitectura prevista

- `coordinator/`: API REST, agentes, proyectos, tareas y persistencia SQLite.
- `sdk/`: contratos públicos y utilidades compartidas para agentes.
- `minecraft-adapter/`: acceso seguro y simulable a capacidades de Minecraft.
- `agents/collector/`: agente recolector.
- `agents/builder/`: agente constructor.
- `agents/explorer/`: agente explorador.
- `agents/common/`: piezas compartidas entre agentes.
- `planner/`: planificación de alto nivel.
- `memory/`: persistencia y memoria compartida.
- `dashboard/`: panel de control.
- `blueprints/`: formato versionado, validación y compilación de planos.
- `docs/`: visión, arquitectura y roadmap.
- `scripts/`: automatizaciones del monorepo.
- `tests/`: pruebas transversales.

## Coordinator v1

El servicio `coordinator` expone una API mínima sobre SQLite con estas rutas:

- `GET /health`
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

Todavía no existe un driver de Mineflayer ni conexión a un mundo. Las pruebas usan drivers simulados y no leen ni modifican datos de Minecraft.

## Agente recolector

`@mineagents/agent-collector` valida solicitudes con posiciones candidatas explícitas, inspecciona primero y sólo rompe coincidencias exactas mediante el adaptador seguro. Ante escasez no modifica nada, salvo que se solicite trabajo parcial de forma expresa.

La cancelación y los fallos conservan el progreso realizado para evitar reintentos ciegos. El resultado representa bloques rotos, no materiales confirmados en inventario; tampoco hay todavía polling del coordinator ni conexión a Minecraft.

## Agente constructor

`@mineagents/agent-builder` valida y deduplica colocaciones absolutas, inspecciona todos los destinos y omite bloques ya correctos. Sólo coloca sobre aire; cualquier bloque distinto detiene la tarea sin escrituras, salvo que se solicite trabajo parcial explícitamente.

El resultado conserva las posiciones colocadas ante cancelaciones o fallos. El builder todavía no interpreta blueprints, verifica inventario ni consume tareas del coordinator.

## Blueprints v1

`@mineagents/blueprints` define un formato JSON estricto con identificador, dimensiones, paleta de bloques y posiciones relativas. Rechaza campos desconocidos, aire, referencias inexistentes, posiciones duplicadas, coordenadas fuera de rango y planos que superen los límites configurados.

`compileBlueprint` traslada un plano validado a colocaciones absolutas compatibles con el builder y calcula la región mínima requerida para solicitar autorización. El módulo no crea autorizaciones, no decide dónde construir y no accede a Minecraft. El esquema completo está en [docs/blueprints.md](docs/blueprints.md).

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

`docker-compose.yml` ya integra el servicio `coordinator` y un volumen para su base SQLite.

```bash
docker compose up --build coordinator
```

## Roadmap inicial

1. Consolidar el monorepo y la documentación base.
2. Terminar contratos del SDK y de tareas compartidas.
3. Evolucionar la cola persistente y el manejo de progreso.
4. Implementar los agentes recolector y constructor sobre límites seguros.
5. Añadir un driver real de Minecraft en una fase controlada y sobre un mundo desechable.
6. Crear dashboard, métricas y despliegue reproducible.

Fuera del MVP inicial quedan la integración con LLM, la economía entre agentes, las personalidades complejas y la búsqueda de imágenes.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Visión](docs/vision.md)
- [Roadmap](docs/roadmap.md)

## Licencia

Este proyecto se distribuye bajo la licencia MIT.
