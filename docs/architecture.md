# Arquitectura

## Estado actual

MineAgents Platform es un monorepositorio TypeScript con npm workspaces. La base incluye un `coordinator` funcional con API REST mínima y persistencia en SQLite, un SDK con contratos públicos y un adaptador seguro y simulable para Minecraft. Todavía no existe un driver real, conexión a un mundo ni lógica de agentes LLM.

## Mapa de componentes

```text
                        ┌──────────────┐
                        │  dashboard   │
                        └──────┬───────┘
                               │
┌─────────┐   contratos   ┌────▼────────┐   tareas y estado   ┌──────────┐
│   sdk   │◄──────────────│ coordinator │───────────────────►│  agents  │
└─────────┘               └────┬───┬────┘                    └────┬─────┘
                               │   │                              │
                         ┌─────▼┐ ┌▼─────────┐              ┌────▼──────┐
                         │memory│ │ planner  │              │blueprints │
                         └──────┘ └──────────┘              └───────────┘
```

El diagrama representa dependencias y flujo previsto. Sólo `coordinator` existe ya como servicio funcional.

## Coordinator v1

El coordinator actúa como núcleo de orquestación y persistencia. En esta versión maneja tres entidades:

- `Agent`: identidad, rol, heartbeat y marca temporal del último contacto.
- `Project`: contenedor lógico para agrupar trabajo.
- `Task`: unidad de trabajo con estado, asignación y marcas temporales.

La API REST expuesta es mínima y sin framework:

- `GET /health`
- `GET /agents`
- `POST /agents/heartbeat`
- `GET /tasks`
- `POST /tasks`
- `POST /tasks/claim`
- `PATCH /tasks/:id`
- `GET /projects`
- `POST /projects`

SQLite se usa como almacén persistente local. La base de datos se inicializa con tablas para agentes, proyectos y tareas, más restricciones básicas para los estados de tarea.

## SDK v1

`@mineagents/sdk` contiene los contratos de agentes, proyectos y tareas que pueden consumir todos los workspaces. También publica parsers para validar datos desconocidos en los límites del sistema y las reglas de transición de tareas.

El SDK no contiene HTTP, SQLite ni lógica de coordinación. El coordinator convierte los errores de contrato a respuestas REST y sigue siendo responsable de almacenar y asignar tareas. La compilación del monorepo sitúa el SDK antes que sus consumidores.

La decisión completa y sus consecuencias se documentan en [ADR 0001](decisions/0001-sdk-contract-boundary.md).

## Adaptador seguro de Minecraft

```text
agents ──► SafeMinecraftAdapter ──► MinecraftDriver ──► Minecraft
                 ▲                       (pendiente)
                 │
          policy + verifier
```

`@mineagents/minecraft-adapter` separa las capacidades que consumen los agentes del futuro cliente de Minecraft. La implementación actual valida regiones, movimiento, bloques permitidos, aprobaciones externas, caducidad y cuotas antes de invocar un driver. La política predeterminada es de sólo lectura y no hay ningún driver real en el repositorio.

La decisión de seguridad completa se documenta en [ADR 0002](decisions/0002-safe-minecraft-adapter.md).

## Organización del monorepo

Cada workspace de producto tiene su propio `package.json`, `tsconfig.json` y punto de entrada bajo `src/`.

- `coordinator/` contiene la API HTTP, validación de entrada, errores y persistencia.
- `sdk/` contiene la capa pública de contratos y validación compartida.
- `minecraft-adapter/` contiene el límite seguro y simulable de acceso al mundo.
- `agents/` separa implementaciones por rol.
- `planner/`, `memory/` y `dashboard/` quedan como módulos independientes.
- `blueprints/` centraliza los formatos de construcción.
- `docs/` documenta decisiones y alcance.

## Límites y dependencias previstas

1. Los agentes dependerán del SDK y de contratos compartidos.
2. El SDK no dependerá de implementaciones concretas.
3. El dashboard sólo consumirá APIs públicas.
4. Minecraft, LLM y almacenamiento adicional quedarán detrás de adaptadores.
5. Cada módulo debe poder validarse sin obligar a cargar el resto del sistema.

## Flujo previsto

```text
Proyecto -> Coordinator -> Cola persistente -> Agente especializado
                 |                                  |
                 +------------ Memory <-------------+
```

La cola persistente y la memoria compartida siguen siendo partes de la evolución del MVP; la primera iteración ya permite crear, reclamar y cerrar tareas con SQLite.

## Decisiones iniciales

- TypeScript estricto y módulos ECMAScript para todos los servicios nuevos.
- npm workspaces para compartir herramientas sin fusionar módulos.
- SQLite local para el coordinator v1, por simplicidad operativa.
- Un `docker-compose.yml` mínimo, ampliado sólo cuando exista un servicio que empaquetar.
- Pruebas transversales en la raíz para validar la estructura y el flujo principal.

Las decisiones que cambien límites, dependencias o tecnologías deberán quedar documentadas antes de su implementación.
