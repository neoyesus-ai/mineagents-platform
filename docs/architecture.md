# Arquitectura

## Estado y alcance

MineAgents Platform comienza como un monorepositorio npm escrito en TypeScript.
Esta fase define límites de módulos, herramientas compartidas y validaciones;
no contiene procesos ejecutables ni integraciones externas.

## Mapa de componentes

```text
                        ┌──────────────┐
                        │  dashboard   │
                        └──────┬───────┘
                               │
┌─────────┐   contratos   ┌────▼────────┐   tareas futuras   ┌──────────┐
│   sdk   │◄──────────────│ coordinator │───────────────────►│  agents  │
└─────────┘               └────┬───┬────┘                    └────┬─────┘
                               │   │                              │
                         ┌─────▼┐ ┌▼─────────┐              ┌────▼──────┐
                         │memory│ │ planner  │              │blueprints │
                         └──────┘ └──────────┘              └───────────┘
```

El diagrama describe dependencias previstas, no comportamiento existente.

- **Coordinator:** será la autoridad sobre proyectos, agentes y tareas.
- **SDK:** publicará contratos estables para los agentes.
- **Agents:** separa `collector`, `builder` y `explorer`; `common`
  contendrá detalles compartidos que no pertenezcan al SDK público.
- **Planner:** alojará planificación de alto nivel. Ningún proveedor LLM está
  elegido o conectado.
- **Memory:** encapsulará la persistencia y la memoria compartida. La tecnología
  de almacenamiento se decidirá en una fase posterior.
- **Dashboard:** será un consumidor de las APIs del coordinador, no una fuente
  de reglas de negocio.
- **Blueprints:** definirá formatos de planos sin ejecutar construcciones.

## Organización del monorepositorio

Los directorios de producto son npm workspaces privados. Cada workspace tiene
su propio `package.json`, `tsconfig.json` y punto de entrada bajo `src/`.
La configuración TypeScript común vive en `tsconfig.base.json`.

Las dependencias deberán avanzar hacia los contratos, evitando importaciones
entre implementaciones concretas. En particular:

1. Los agentes podrán depender del SDK y de contratos de planos.
2. El SDK no dependerá del coordinador ni de agentes concretos.
3. El dashboard sólo accederá al sistema mediante interfaces públicas.
4. Las integraciones con Minecraft, almacenamiento y LLM quedarán detrás de
   adaptadores cuando se implementen.

## Flujo previsto

```text
Proyecto -> Coordinator -> Cola persistente -> Agente especializado
                 |                                  |
                 +------------ Memory <-------------+
```

La cola persistente, la memoria y este flujo son objetivos del MVP, no
componentes de la base actual.

## Decisiones iniciales

- TypeScript estricto y módulos ECMAScript para todos los servicios nuevos.
- npm workspaces para compartir herramientas sin fusionar los módulos.
- Un `docker-compose.yml` mínimo, sin inventar servicios antes de diseñarlos.
- Pruebas estructurales en la raíz para detectar desviaciones del monorepo.

Las decisiones que cambien límites, dependencias o tecnologías deberán quedar
documentadas antes de su implementación.
