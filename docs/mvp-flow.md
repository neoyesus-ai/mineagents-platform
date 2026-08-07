# Flujo integral simulado del MVP

La prueba `tests/mvp-flow.test.mjs` conecta los componentes implementados sin acceder a un servidor Minecraft ni modificar un mundo real.

## Recorrido verificado

```text
coordinator HTTP
  ├─ claim collector ─► SafeMinecraftAdapter ─► mundo en memoria
  ├─ claim builder ───► blueprint compiler ───► SafeMinecraftAdapter
  └─ API pública ─────► dashboard snapshot
```

El escenario ejecuta este flujo:

1. Crea un proyecto persistente y registra un collector.
2. Crea, reclama e inicia una tarea de recolección.
3. Verifica una autorización externa acotada y rompe dos bloques simulados.
4. Completa la tarea y compila un blueprint de dos bloques.
5. Registra un builder, reclama la siguiente tarea y coloca el blueprint con otra autorización.
6. Comprueba el estado final mediante el endpoint de snapshot del dashboard.
7. Reinicia el coordinator sobre el mismo SQLite y confirma las dos tareas completadas.

El driver en memoria exige coincidencias exactas al romper y destinos vacíos al colocar. La prueba comprueba además el orden de las cuatro mutaciones y que cada una atravesó el verificador de autorizaciones.

## Ejecución

```bash
npm run build
node --test tests/mvp-flow.test.mjs
```

La suite general también la incluye mediante `npm run test`.

## Límites

- No conecta Mineflayer ni escribe en el volumen `minecraft-demo-data`.
- No demuestra inventario, drops, recetas, latencia de red ni física real.
- La composición de solicitudes de collector y builder vive en el harness de prueba.
- Los agentes todavía no hacen polling ni traducen automáticamente una tarea genérica del coordinator a una orden Minecraft.
- La prueba real sobre el mundo desechable continúa pendiente y requiere una autorización explícita antes de ejecutar escrituras.

Por estos límites, esta prueba cierra la integración lógica del MVP, pero no la validación de escritura sobre Minecraft indicada en la Fase 3.
