# ADR 0005 — Formato versionado de blueprints

- Estado: aceptada
- Fecha: 2026-08-06

## Contexto

El builder recibe colocaciones absolutas, pero una estructura reutilizable necesita posiciones relativas y una forma estable de nombrar materiales. El formato debe poder validarse antes de solicitar permisos o acceder al mundo.

## Decisión

`@mineagents/blueprints` define `BlueprintV1`, un documento declarativo con `schemaVersion: 1`, identificador, dimensiones, paleta y una lista ordenada de bloques relativos.

La validación es estricta y defensiva:

- rechaza versiones y campos desconocidos;
- exige identificadores de bloque namespaced y excluye bloques de aire;
- comprueba límites, referencias de paleta y coordenadas relativas;
- rechaza posiciones duplicadas;
- copia los datos aceptados para no retener objetos del llamador.

`compileBlueprint` traduce el documento desde un origen absoluto a colocaciones compatibles con el builder y calcula la región mínima requerida. La operación conserva el orden del documento y detecta desbordamientos de enteros.

El módulo no genera autorizaciones, elige ubicaciones, reemplaza bloques ni accede a Minecraft.

## Consecuencias

- Los planos pueden almacenarse, revisar y probar sin un mundo activo.
- El builder permanece independiente del formato y vuelve a aplicar sus controles.
- La región calculada facilita permisos de mínimo alcance, pero no constituye una autorización.
- Rotaciones, espejado, estados de bloque, entidades y formatos comprimidos requerirán una extensión compatible o una nueva versión.
