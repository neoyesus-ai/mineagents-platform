# MineAgents Platform

MineAgents Platform es la base de una plataforma modular para coordinar agentes
autónomos y colaborativos en Minecraft Java Edition. El proyecto se organiza
como un monorepositorio TypeScript para que cada componente pueda evolucionar,
probarse y desplegarse de forma independiente.

> Estado actual: sólo existe el esqueleto técnico. No hay conexión a Minecraft,
> agentes funcionales, coordinador, base de datos, dashboard ni integración LLM.

## Visión multiagente

La visión es que varios agentes especializados colaboren en proyectos comunes.
Un coordinador asignará tareas; los agentes recolectores, constructores y
exploradores aportarán capacidades distintas; y los módulos de planificación,
memoria y planos compartirán contexto sin acoplar las implementaciones.

La plataforma priorizará la supervisión humana, la trazabilidad de cada tarea y
la protección de los mundos. Ningún módulo de esta fase puede conectarse a un
servidor o modificar un mundo de Minecraft.

## Arquitectura prevista

- `coordinator/`: gestión futura de agentes, proyectos y tareas.
- `sdk/`: contratos y utilidades públicas para crear agentes.
- `agents/collector/`: futuro agente recolector.
- `agents/builder/`: futuro agente constructor.
- `agents/explorer/`: futuro agente explorador.
- `agents/common/`: piezas compartidas únicamente por los agentes.
- `planner/`: planificación de alto nivel e integración LLM futura.
- `memory/`: persistencia y memoria compartida futura.
- `dashboard/`: panel de control futuro.
- `blueprints/`: modelos y validación de planos de construcción.
- `docs/`: visión, arquitectura y roadmap.
- `scripts/`: automatizaciones compartidas.
- `tests/`: pruebas transversales del monorepositorio.

Todos los módulos de producto son npm workspaces privados. Por ahora sólo
exportan un punto de entrada TypeScript vacío para validar la estructura y los
límites entre paquetes.

## Requisitos

- Node.js 22 o posterior.
- npm 10 o posterior.
- Docker con Compose, opcional para fases posteriores.

## Instalación

```bash
npm install
cp .env.example .env
```

El archivo `.env.example` sólo contiene valores locales no sensibles. No
añadas secretos ni credenciales al repositorio.

## Validaciones

```bash
npm run build
npm run test
npm run lint
npm run typecheck
```

- `build` compila todos los workspaces que declaran compilación.
- `test` ejecuta las pruebas estructurales.
- `lint` aplica las reglas estáticas a TypeScript y JavaScript.
- `typecheck` comprueba tipos sin generar archivos.

`docker-compose.yml` es deliberadamente un placeholder sin servicios. Se
completará cuando exista una implementación que empaquetar.

## Roadmap inicial

1. Consolidar el monorepositorio y la integración continua.
2. Diseñar los contratos del SDK y del coordinador.
3. Incorporar una cola persistente de tareas y memoria compartida.
4. Crear agentes recolector y constructor con límites de seguridad.
5. Añadir integración controlada con Minecraft Java Edition.
6. Construir un dashboard mínimo y documentar el despliegue.

La planificación mediante LLM, la economía, las personalidades complejas y la
búsqueda de imágenes quedan fuera del MVP inicial.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Visión](docs/vision.md)
- [Roadmap](docs/roadmap.md)

## Licencia

Este proyecto se distribuye bajo la [licencia MIT](LICENSE).
