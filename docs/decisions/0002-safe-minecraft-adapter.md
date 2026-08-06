# ADR 0002 — Adaptador de Minecraft seguro por defecto

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

Los agentes recolector y constructor necesitarán observar y, bajo supervisión, modificar un mundo de Minecraft. Exponer directamente Mineflayer u otro cliente a cada agente permitiría saltarse límites espaciales, listas de bloques y aprobación humana.

## Decisión

Se crea el workspace independiente `@mineagents/minecraft-adapter`. Los agentes consumirán `MinecraftAdapter`; un futuro conector implementará `MinecraftDriver` y será el único módulo que hable con Mineflayer o con Minecraft Java Edition.

`SafeMinecraftAdapter` envuelve el driver y aplica controles antes de delegar:

- Toda posición debe pertenecer a una región y dimensión permitidas.
- El movimiento puede deshabilitarse y el driver recibe las regiones que no debe abandonar.
- Colocar y romper bloques se deniega si la lista correspondiente está vacía.
- Cada bloque permitido usa un identificador namespaced explícito.
- Toda escritura requiere una autorización externa verificable, ligada a una tarea, acciones, región, caducidad y cuota máxima.
- Las cuotas cuentan intentos autorizados, incluso si el driver falla, para evitar reintentos ilimitados.
- Romper un bloque incluye el nombre esperado; el futuro driver deberá comprobarlo de forma atómica antes de modificar el mundo.

`createReadOnlyMinecraftPolicy` es el camino predeterminado: permite inspección dentro de regiones explícitas, desactiva movimiento salvo petición consciente y no autoriza escrituras.

Esta fase no incorpora un driver real, credenciales, conexión de red ni acceso a datos de ningún mundo.

## Consecuencias

- Los agentes y sus pruebas pueden depender de una interfaz simulable.
- Una aprobación declarada por el propio agente no basta: un verificador externo debe confirmarla.
- Las políticas se copian al construir el adaptador para evitar que una mutación posterior amplíe permisos.
- El futuro driver será una pieza de confianza pequeña que deberá probar que respeta rutas acotadas y operaciones atómicas.
- La primera prueba real sólo podrá ejecutarse en un mundo desechable dedicado y con autorización humana.
