# Arquitectura

MineAgents Platform es un monorepositorio TypeScript modular. Los procesos ejecutables dependen de contratos compartidos y las integraciones externas quedaran detras de adaptadores.

## Componentes

- **Coordinator:** autoridad sobre agentes, proyectos y tareas.
- **SDK:** contratos comunes.
- **Agents:** recolector y constructor como procesos especializados.
- **Planner:** contratos de planes, sin proveedor LLM.
- **Memory:** abstraccion de persistencia compartida.
- **Dashboard:** futura interfaz operativa.
- **Blueprints:** representacion neutral de construcciones.

## Flujo previsto

```text
Cliente -> Coordinator -> Cola persistente -> Agente
               |                              |
               +---------- Memory <-----------+
```

PostgreSQL sera la persistencia inicial. La cola usara transacciones para reclamar trabajo y recuperarse de reinicios antes de considerar otro broker.

Actualmente no existe conexion a Minecraft, mutacion del mundo, autenticacion de bots ni integracion LLM. Las decisiones arquitectonicas relevantes se documentaran en `docs/decisions/`.
