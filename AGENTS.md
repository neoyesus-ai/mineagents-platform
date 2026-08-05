# MineAgents Platform — instrucciones de desarrollo

## Objetivo

Construir una plataforma modular de agentes autónomos y colaborativos para
Minecraft Java Edition.

## Reglas

- Usar TypeScript para los nuevos servicios.
- Mantener una arquitectura modular.
- No crear archivos monolíticos.
- No introducir secretos ni credenciales en el repositorio.
- No modificar ni borrar datos del mundo Minecraft.
- No ejecutar comandos destructivos sin aprobación.
- No hacer push directamente sin revisar primero los cambios.
- Mantener `main` funcional.
- Ejecutar validaciones antes de cada commit.
- Documentar las decisiones arquitectónicas importantes.

## Arquitectura prevista

- coordinator: gestión de agentes, proyectos y tareas.
- sdk: biblioteca común de agentes.
- agents: implementaciones por rol.
- planner: planificación de alto nivel y LLM.
- memory: persistencia y memoria compartida.
- dashboard: panel de control.
- blueprints: planos de construcción.
- docs: documentación técnica.

## MVP

La primera versión debe incluir:

1. Coordinador.
2. Cola persistente de tareas.
3. Agent SDK.
4. Agente recolector.
5. Agente constructor.
6. Docker Compose.
7. Pruebas básicas.
8. Documentación de despliegue.

No implementar todavía economía, personalidades complejas ni búsqueda de
imágenes.