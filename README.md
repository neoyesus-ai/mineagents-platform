# MineAgents Platform

MineAgents Platform es una plataforma modular para coordinar agentes autónomos y colaborativos orientados a Minecraft Java Edition. El repositorio está organizado como un monorepo TypeScript para que cada servicio pueda evolucionar sin acoplarse al resto.

## Qué es

La idea central es separar responsabilidades: un coordinator administra tareas y proyectos, los agentes ejecutan trabajo especializado, el planner organizará estrategias de alto nivel, memory conservará contexto, y dashboard mostrará el estado operativo. La base actual incluye un coordinator funcional con API REST y persistencia en SQLite, además de contratos públicos y validación compartida en el SDK; el resto de módulos sigue siendo base arquitectónica.

## Visión multiagente

La visión es que varios agentes especializados colaboren sobre un mismo proyecto sin competir por el control del sistema.

- El coordinator asigna y supervisa tareas.
- El agent collector recopilará información o recursos.
- El agent builder ejecutará tareas de construcción.
- El agent explorer inspeccionará zonas y contexto.
- El SDK comparte contratos, parsers y reglas del ciclo de tareas.
- Planner, memory y blueprints aportarán planificación, memoria y planos sin mezclar responsabilidades.

La plataforma prioriza supervisión humana, trazabilidad y seguridad del mundo. Todavía no hay conexión a Minecraft, Mineflayer ni LLM.

## Arquitectura prevista

- `coordinator/`: API REST, agentes, proyectos, tareas y persistencia SQLite.
- `sdk/`: contratos públicos y utilidades compartidas para agentes.
- `agents/collector/`: agente recolector.
- `agents/builder/`: agente constructor.
- `agents/explorer/`: agente explorador.
- `agents/common/`: piezas compartidas entre agentes.
- `planner/`: planificación de alto nivel.
- `memory/`: persistencia y memoria compartida.
- `dashboard/`: panel de control.
- `blueprints/`: planos de construcción.
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
5. Añadir adaptador de Minecraft en una fase controlada.
6. Crear dashboard, métricas y despliegue reproducible.

Fuera del MVP inicial quedan la integración con LLM, la economía entre agentes, las personalidades complejas y la búsqueda de imágenes.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Visión](docs/vision.md)
- [Roadmap](docs/roadmap.md)

## Licencia

Este proyecto se distribuye bajo la licencia MIT.
