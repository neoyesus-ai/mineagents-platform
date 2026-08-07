# Roadmap

El roadmap avanza por fases verificables. Completar una fase no habilita automáticamente la siguiente.

## Fase 0 — Base del repositorio

- [x] Crear el monorepositorio TypeScript con npm workspaces.
- [x] Definir los límites iniciales de módulos.
- [x] Añadir build, pruebas, lint y comprobación de tipos.
- [x] Añadir Docker Compose como base de despliegue.
- [x] Documentar visión, arquitectura y roadmap.

## Fase 1 — Coordinator v1

- [x] Diseñar y crear las entidades `Agent`, `Task` y `Project`.
- [x] Exponer una API REST mínima.
- [x] Usar SQLite para persistencia local.
- [x] Implementar estados de tarea y flujo de claim.
- [x] Añadir validación de entrada y manejo de errores.
- [x] Añadir pruebas básicas del servicio.
- [x] Integrar el servicio en Docker Compose.
- [x] Documentar el uso del coordinator.

## Fase 2 — Contratos del SDK

- [x] Definir contratos públicos estables para agentes.
- [x] Separar utilidades compartidas de lógica de coordinación.
- [x] Añadir pruebas unitarias de contratos.

## Fase 3 — Agentes del MVP

- [x] Diseñar un adaptador seguro para Minecraft Java Edition.
- [x] Implementar el agente recolector.
- [x] Implementar el agente constructor.
- [x] Definir y validar el formato de planos.
- [ ] Probar en un mundo desechable dedicado.

## Fase 4 — Operación

- [x] Crear un dashboard mínimo.
- [x] Añadir métricas y logs estructurados.
- [x] Documentar despliegue, respaldo y recuperación.
- [x] Ejecutar una prueba integral simulada del flujo del MVP.

## Fuera del MVP inicial

- Integración con LLM y planificación autónoma.
- Economía o mercados entre agentes.
- Personalidades complejas.
- Búsqueda de imágenes.
- Modificaciones del mundo sin supervisión explícita.
