# ADR 0003 — Recolector acotado y dirigido por candidatos

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

El agente recolector necesita obtener recursos sin explorar o modificar el mundo de manera abierta. Todavía no existe un driver real, una fuente automática de posiciones ni un contrato de inventario que confirme la recogida de drops.

## Decisión

`@mineagents/agent-collector` recibe solicitudes `CollectBlocksRequest` con una tarea, bloque namespaced, cantidad, posiciones candidatas explícitas y una autorización del adaptador.

El flujo se divide en dos fases:

1. Validar límites, deduplicar posiciones y comprobar que toda la solicitud pertenece al alcance `break-block` de la misma tarea.
2. Inspeccionar candidatos sin escribir y romper únicamente coincidencias exactas.

Si no hay coincidencias suficientes, el comportamiento predeterminado devuelve `insufficient-resources` sin romper bloques. El llamador debe establecer `allowPartial` para aceptar trabajo parcial.

La cancelación devuelve las operaciones ya terminadas. Un fallo del adaptador lanza `CollectorExecutionError` con un resultado parcial, de modo que el coordinator futuro pueda evitar reintentos ciegos.

## Consecuencias

- El recolector no busca ubicaciones, explora chunks ni decide qué bloques son prescindibles.
- Toda escritura sigue pasando por `MinecraftAdapter` y su verificador externo.
- Las solicitudes se copian antes de cualquier operación asíncrona.
- El resultado contabiliza bloques rotos correctamente por el adaptador, no materiales confirmados en inventario.
- La integración con la cola del coordinator, la generación de candidatos y la recogida real de drops quedan para incrementos posteriores.
- Las pruebas usan un adaptador simulado y no acceden a ningún mundo.
