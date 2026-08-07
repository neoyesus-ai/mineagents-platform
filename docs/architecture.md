# Arquitectura

## Estado actual

MineAgents Platform es un monorepositorio TypeScript con npm workspaces. La base incluye un `coordinator` funcional con API REST mínima y persistencia en SQLite, un dashboard operativo de sólo lectura, observabilidad HTTP compartida, un SDK con contratos públicos, un adaptador seguro, un driver Mineflayer con movimiento y escrituras acotadas y un formato validado de blueprints. Docker Compose aporta un servidor Vanilla desechable y conecta un observador sin órdenes; las escrituras aún no se han ejecutado sobre el servidor y no existe lógica de agentes LLM.

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

El diagrama representa dependencias y flujo previsto. `coordinator` y `dashboard` existen ya como servicios funcionales; los demás módulos son bibliotecas o bases para servicios futuros.

## Coordinator v1

El coordinator actúa como núcleo de orquestación y persistencia. En esta versión maneja tres entidades:

- `Agent`: identidad, rol, heartbeat y marca temporal del último contacto.
- `Project`: contenedor lógico para agrupar trabajo.
- `Task`: unidad de trabajo con estado, asignación y marcas temporales.

La API REST expuesta es mínima y sin framework:

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

SQLite se usa como almacén persistente local. La base de datos se inicializa con tablas para agentes, proyectos y tareas, más restricciones básicas para los estados de tarea.

## SDK v1

`@mineagents/sdk` contiene los contratos de agentes, proyectos y tareas que pueden consumir todos los workspaces. También publica parsers para validar datos desconocidos en los límites del sistema y las reglas de transición de tareas.

El SDK no contiene HTTP, SQLite ni lógica de coordinación. El coordinator convierte los errores de contrato a respuestas REST y sigue siendo responsable de almacenar y asignar tareas. La compilación del monorepo sitúa el SDK antes que sus consumidores.

La decisión completa y sus consecuencias se documentan en [ADR 0001](decisions/0001-sdk-contract-boundary.md).

## Adaptador seguro de Minecraft

```text
agents ──► SafeMinecraftAdapter ──► MinecraftDriver ──► Minecraft
                 ▲             (movimiento y escrituras acotadas)
                 │
          policy + verifier
```

`@mineagents/minecraft-adapter` separa las capacidades que consumen los agentes del cliente concreto de Minecraft. La implementación valida regiones, movimiento, bloques permitidos, aprobaciones externas, caducidad y cuotas antes de invocar un driver. La política predeterminada es de sólo lectura.

La decisión de seguridad completa se documenta en [ADR 0002](decisions/0002-safe-minecraft-adapter.md).

## Driver Mineflayer con movimiento acotado

```text
coordinator ◄── heartbeat ── mineflayer-observer ──► minecraft:25565
                                  │
                                  └── MineflayerDriver ──► inspección + acciones acotadas
```

`@mineagents/mineflayer-driver` implementa el límite `MinecraftDriver` para estado, inspección, movimiento y escrituras acotadas. Cada movimiento exige regiones explícitas que contengan la posición inicial y el destino. El pathfinder excluye pasos fuera de ellas, una vigilancia detiene cualquier salida durante la ejecución y un timeout acota la operación. El perfil de navegación no excava, coloca bloques, abre puertas, hace parkour ni usa andamiaje.

La colocación y rotura usan precondiciones exactas, alcance local, inventario explícito y verificación posterior, pero sólo `SafeMinecraftAdapter` puede autorizar una escritura. El proceso observador usa autenticación offline local, mantiene su registro en el coordinator y no expone órdenes. La evolución se documenta en [ADR 0009](decisions/0009-read-only-mineflayer-driver.md), [ADR 0010](decisions/0010-bounded-mineflayer-movement.md) y [ADR 0011](decisions/0011-preconditioned-mineflayer-writes.md).

## Servidor Minecraft de desarrollo

```text
agente en Compose ──► minecraft:25565 ──► mundo mineagents-demo
cliente en host    ──► 127.0.0.1:25565 ──┘
```

Compose fija Minecraft Java Edition 1.21.11 sobre una imagen con Java 21. El mundo vive únicamente en el volumen `minecraft-demo-data`, separado de cualquier instalación o mundo existente. La autenticación online se desactiva sólo para desarrollo local y el puerto publicado se limita a loopback.

El servidor no elimina el límite `MinecraftDriver`: disponer de un destino de pruebas no autoriza a los agentes a escribir en él. Cualquier ampliación de capacidades debe conservar `SafeMinecraftAdapter`, sus políticas y sus autorizaciones. La operación se documenta en [Servidor Minecraft de desarrollo](minecraft-server.md) y la decisión en [ADR 0008](decisions/0008-disposable-minecraft-server.md).

## Agente recolector

`@mineagents/agent-collector` implementa una ejecución acotada y dirigida por posiciones candidatas. Valida que la autorización pertenezca a la tarea, inspecciona antes de escribir y sólo delega rupturas de bloques que coinciden exactamente con el recurso solicitado.

La escasez no produce cambios por defecto; el trabajo parcial debe autorizarse expresamente. Las cancelaciones y errores conservan el progreso para permitir reintentos seguros. El módulo todavía no genera candidatos, consume la cola del coordinator ni confirma drops en inventario.

La decisión y sus límites se documentan en [ADR 0003](decisions/0003-bounded-collector-agent.md).

## Agente constructor

`@mineagents/agent-builder` ejecuta colocaciones absolutas mediante un preflight completo. Deduplica posiciones, omite bloques ya correctos y sólo coloca sobre bloques de aire. Un bloque distinto marca el destino como bloqueado y evita todas las escrituras, salvo que el trabajo parcial sea explícito.

Cancelaciones y errores conservan las posiciones terminadas para soportar reintentos idempotentes. El builder todavía no interpreta planos, comprueba inventario ni se conecta a la cola del coordinator.

La decisión y la política de no reemplazo se documentan en [ADR 0004](decisions/0004-idempotent-builder-agent.md).

## Blueprints v1

`@mineagents/blueprints` es una capa declarativa sin acceso a Minecraft. Valida un documento versionado con dimensiones, paleta y bloques relativos, y lo compila desde un origen absoluto a `BuildPlacement[]` conservando el orden del documento.

La compilación devuelve además la región mínima que contiene las colocaciones, pero no crea una autorización ni inicia el builder. Así, la descripción de la estructura permanece separada de la decisión operativa y del acceso al mundo.

El esquema se documenta en [Blueprints v1](blueprints.md) y la decisión arquitectónica en [ADR 0005](decisions/0005-versioned-blueprint-format.md).

## Dashboard de sólo lectura

```text
navegador ──GET──► dashboard ──GET──► coordinator
```

`@mineagents/dashboard` agrega las rutas públicas de lectura del coordinator y presenta un snapshot operativo en HTML renderizado en servidor. No reexporta controles de mutación, no accede directamente a SQLite y no conoce Minecraft.

Las respuestas externas se validan antes de renderizarse, el contenido dinámico se escapa y el servidor aplica una política CSP restrictiva. La ausencia del coordinator se representa como un estado 502 controlado. El endpoint `/api/snapshot` permite consumir la misma vista agregada sin duplicar acceso a la base.

La operación se documenta en [Dashboard](dashboard.md) y la separación de lectura en [ADR 0006](decisions/0006-read-only-dashboard.md).

## Observabilidad HTTP

`@mineagents/observability` contiene utilidades independientes de los dominios para emitir logs JSON y métricas Prometheus. Coordinator y dashboard resuelven sus propias rutas acotadas antes de observar una respuesta, evitando que IDs, queries o paths arbitrarios generen etiquetas de alta cardinalidad.

Cada servicio expone `/metrics`, añade un request ID a la respuesta y registra solicitudes terminadas. El logger es inyectable para pruebas y silencioso cuando los servidores se usan como bibliotecas; los CLI habilitan la salida JSON a stdout.

El contrato operativo se documenta en [Observabilidad](observability.md) y la decisión de cardinalidad en [ADR 0007](decisions/0007-bounded-http-observability.md).

## Organización del monorepo

Cada workspace de producto tiene su propio `package.json`, `tsconfig.json` y punto de entrada bajo `src/`.

- `coordinator/` contiene la API HTTP, validación de entrada, errores y persistencia.
- `sdk/` contiene la capa pública de contratos y validación compartida.
- `observability/` contiene logging JSON y métricas HTTP sin dependencias de dominio.
- `minecraft-adapter/` contiene el límite seguro y simulable de acceso al mundo.
- `minecraft-driver-mineflayer/` implementa conexión real, inspección y movimiento acotado, además de su proceso observador.
- `agents/` separa implementaciones por rol.
- `dashboard/` contiene el cliente HTTP, la vista y su servidor de sólo lectura.
- `planner/` y `memory/` quedan como módulos independientes.
- `blueprints/` valida y compila formatos de construcción versionados.
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
