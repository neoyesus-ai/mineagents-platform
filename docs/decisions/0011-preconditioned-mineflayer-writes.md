# ADR 0011: escrituras Mineflayer con precondiciones

## Estado

Aceptada.

## Contexto

El adaptador seguro ya exige política, autorización externa, región, caducidad y cuota antes de delegar una escritura. El driver Mineflayer sólo implementaba inspección y movimiento, por lo que collector y builder no podían alcanzar un cliente real aunque superasen esa frontera.

Dar al pathfinder permiso para excavar o colocar mezclaría navegación con mutaciones y ampliaría innecesariamente el alcance de cada orden.

## Decisión

`MineflayerDriver` implementará colocación y rotura mediante un controlador dedicado, sin habilitar escrituras en el pathfinder.

Cada operación:

- valida coordenadas, dimensión activa e identificadores namespaced;
- trabaja sobre snapshots de los argumentos tomados antes del primer `await`;
- exige que el chunk ya esté cargado;
- comprueba el nombre exacto del bloque antes de actuar;
- no se mueve, fabrica ni elige un material alternativo;
- verifica el bloque observado después de que Mineflayer informe éxito;
- se excluye mutuamente con movimiento y con cualquier otra escritura.

Para colocar, el inventario debe contener el bloque exacto y debe existir una cara sólida adyacente dentro del alcance de interacción. Para romper, `canDigBlock` debe confirmar alcance y capacidad; la rotura usa raycast sobre el bloque ya validado.

`SafeMinecraftAdapter` continúa siendo la única frontera que verifica autorización externa. El driver mantiene precondiciones defensivas si se invoca directamente, pero no interpreta tokens ni políticas. El proceso `mineflayer-observer` no expone endpoints de órdenes ni consume tareas de escritura.

## Consecuencias

- Collector y builder pueden usar un driver real sin relajar el modelo de autorización.
- Un estado obsoleto, inventario insuficiente, chunk ausente, falta de alcance o postcondición incorrecta falla con un error acotado.
- El movimiento no puede solaparse con una escritura.
- Las pruebas automatizadas usan un mundo en memoria y no modifican `minecraft-demo-data`.
- La validación real sobre el mundo desechable permanece pendiente y requiere autorización explícita.
