# ADR 0009: driver Mineflayer inicialmente read-only

## Estado

Sustituida parcialmente por ADR 0010 y ADR 0011.

## Contexto

El adaptador seguro ya define capacidades de estado, inspección, movimiento y escritura, pero validar todas ellas a la vez contra un mundo real ampliaría demasiado el riesgo operativo. Primero se necesita demostrar compatibilidad de protocolo, conexión, ciclo de vida y registro en el coordinator.

## Decisión

`@mineagents/mineflayer-driver` implementará inicialmente sólo estado e inspección de bloques cargados. Movimiento, colocación y rotura fallarán con `UNSUPPORTED_OPERATION`, incluso si se invoca el driver directamente.

El servicio `mineflayer-observer` usará una identidad offline sin credenciales dentro de la red de Compose, esperará al healthcheck del servidor 1.21.11 y enviará heartbeats al coordinator. No cargará chunks remotos ni intentará reconectarse dentro del proceso; Docker gestiona reinicios inesperados.

## Consecuencias

- Ya se puede verificar un agente real dentro del mundo desechable.
- Ninguna acción del observador modifica bloques ni desplaza al personaje.
- El coordinator refleja la presencia del agente mediante heartbeats.
- Movimiento y escrituras exigirán una decisión posterior, pathfinding acotado y pruebas de autorizaciones contra el driver real.
- La identidad offline sólo es apropiada porque el puerto del servidor se limita a loopback.
