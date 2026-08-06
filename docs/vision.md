# Visión

MineAgents Platform aspira a que varios agentes especializados colaboren en proyectos de Minecraft Java Edition de forma observable, segura y recuperable. La plataforma debe permitir que una persona defina objetivos, supervise el trabajo y detenga cualquier operación sensible.

## Modelo de colaboración

Cada agente tendrá un rol limitado y explícito:

- El recolector obtendrá materiales o información autorizada.
- El constructor ejecutará tareas de construcción validadas.
- El explorador recopilará contexto del entorno.
- El coordinator distribuirá trabajo y mantendrá su estado.
- La memoria y el planificador aportarán contexto compartido sin controlar directamente Minecraft.

La especialización debe permitir reemplazar o ampliar un agente sin rehacer el resto de la plataforma.

## Principios

1. **Seguridad del mundo:** ninguna acción destructiva será implícita.
2. **Control humano:** las operaciones sensibles tendrán límites y aprobación.
3. **Trazabilidad:** cada tarea tendrá estado, historial y resultado.
4. **Modularidad:** agentes e integraciones evolucionarán independientemente.
5. **Recuperación:** los reinicios no perderán tareas ni duplicarán trabajo.
6. **Contratos claros:** la colaboración ocurrirá mediante interfaces estables.
7. **Evolución gradual:** cada fase deberá ser verificable antes de añadir autonomía.

## Límites actuales

La base actual incluye un coordinator funcional, un adaptador seguro simulable, agentes acotados de recolección y construcción y blueprints validados. Todavía no hay Mineflayer, driver de Minecraft, dashboard real, integración LLM, construcción autónoma ni conexión a mundos de Minecraft.

La economía, las personalidades complejas, la búsqueda de imágenes y la planificación autónoma mediante LLM permanecen fuera del MVP inicial.
