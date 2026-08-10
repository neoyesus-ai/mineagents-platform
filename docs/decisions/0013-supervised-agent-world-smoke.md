# ADR 0013: smoke supervisado y reversible de agentes

## Estado

Aceptada.

## Contexto

Collector, builder, `SafeMinecraftAdapter` y el driver Mineflayer estaban cubiertos en memoria, mientras que movimiento e inspección ya se habían comprobado contra un servidor real. Faltaba verificar una rotura y colocación reales sin habilitar órdenes generales ni arriesgar un mundo existente.

Una llamada Mineflayer puede producir un resultado ambiguo: el servidor puede aplicar una escritura aunque el cliente reciba tarde la actualización, o el primer intento de colocación puede fallar después de una rotura reciente. Confiar sólo en el resultado de la promesa produciría falsos fallos o reintentos inseguros.

## Decisión

`smoke:agents` será una operación manual y separada del observer. Para iniciarla exige una frase de aprobación exacta, coordenadas enteras, dimensión y bloque namespaced. No descubre ni elige un destino de escritura.

Antes de romper:

- inspecciona que el bloque actual coincida exactamente;
- exige que el inventario ya contenga el bloque de reposición;
- crea una política sin movimiento cuya región contiene una sola coordenada;
- limita cada autorización a una acción y a sesenta segundos.

Collector rompe una coincidencia exacta. Builder vuelve a inspeccionar y puede realizar como máximo dos intentos idempotentes, cada uno con una autorización distinta. Si el primer intento ya surtió efecto, el segundo lo reconoce como satisfecho y no escribe. Si ambos fallan, una tercera autorización independiente sólo puede restaurar el mismo bloque en el mismo destino vacío.

El driver consulta la postcondición durante un intervalo acotado. Cuando Mineflayer informa error después de una mutación, la postcondición exacta prevalece; si no coincide, se conserva el error. Nunca se sobrescribe un bloque inesperado.

## Verificación real

El 7 de agosto de 2026 se ejecutó contra Minecraft Java 1.21.11 en un contenedor, puerto y volumen exclusivos. El objetivo fue `minecraft:grass_block` en `(8,-61,-7)` del overworld.

El resultado final fue:

- collector `completed`, con un bloque inspeccionado y roto;
- builder `completed` en el segundo intento, con un bloque colocado;
- `restored: true`;
- una conexión independiente confirmó después el mismo `minecraft:grass_block` sólido;
- el servidor se detuvo limpiamente y el volumen se conservó.

## Consecuencias

- La fase de agentes del MVP queda validada en un mundo desechable real.
- La prueba no forma parte de `npm test` y nunca escribe sin aprobación operativa explícita.
- El observer de Compose continúa sin endpoints de órdenes y con política de solo lectura.
- El reintento no amplía coordenadas, materiales ni cuotas, y siempre repite el preflight del builder.
- El volumen de evidencia no se borra automáticamente.
