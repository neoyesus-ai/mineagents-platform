# Roadmap

El roadmap avanza por fases verificables. Completar una fase no autoriza
automáticamente las integraciones de la siguiente.

## Fase 0 — Base del repositorio

- [x] Crear el monorepositorio TypeScript con npm workspaces.
- [x] Definir los límites iniciales de módulos.
- [x] Añadir build, pruebas, lint y comprobación de tipos.
- [x] Añadir Docker Compose como placeholder.
- [x] Documentar visión, arquitectura y roadmap.
- [ ] Configurar integración continua.

## Fase 1 — Contratos del núcleo

- [ ] Diseñar las entidades de proyecto, agente y tarea.
- [ ] Definir el ciclo de vida de tareas y sus errores.
- [ ] Publicar los contratos mínimos del SDK.
- [ ] Registrar las decisiones arquitectónicas.
- [ ] Añadir pruebas unitarias de contratos.

## Fase 2 — Coordinación y persistencia

- [ ] Diseñar la API del coordinador.
- [ ] Elegir la tecnología de persistencia.
- [ ] Implementar una cola persistente de tareas.
- [ ] Gestionar registro, heartbeat, reintentos y progreso.
- [ ] Probar recuperación tras reinicios y concurrencia.

## Fase 3 — Agentes del MVP

- [ ] Diseñar un adaptador seguro para Minecraft Java Edition.
- [ ] Implementar el agente recolector.
- [ ] Definir y validar el formato de planos.
- [ ] Implementar el agente constructor con áreas restringidas.
- [ ] Probar en un mundo desechable dedicado.

El explorador tiene espacio reservado en la arquitectura, pero no bloquea el
MVP formado por recolector y constructor.

## Fase 4 — Operación

- [ ] Crear un dashboard mínimo.
- [ ] Añadir métricas y logs estructurados.
- [ ] Documentar despliegue, respaldo y recuperación.
- [ ] Ejecutar una prueba integral del flujo del MVP.

## Fuera del MVP inicial

- Integración con LLM y planificación autónoma.
- Economía o mercados entre agentes.
- Personalidades complejas.
- Búsqueda de imágenes.
- Modificaciones del mundo sin límites y supervisión explícitos.
