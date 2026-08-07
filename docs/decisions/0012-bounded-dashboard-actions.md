# ADR 0012 — Acciones acotadas desde el dashboard

- Estado: aceptada
- Fecha: 2026-08-07

## Contexto

El dashboard de ADR 0006 proporcionó visibilidad sin superficie de escritura. La operación diaria necesita crear proyectos y tareas sin recurrir a llamadas HTTP manuales, y necesita detener trabajo que ya no debe continuar.

El coordinator ya es el propietario de estas operaciones y de sus transiciones de estado. El dashboard no debe duplicar esa lógica, acceder a SQLite ni asumir responsabilidades propias de los agentes.

## Decisión

El dashboard expondrá tres acciones HTML acotadas:

- crear un proyecto;
- crear una tarea pendiente, opcionalmente asociada a un proyecto;
- cancelar una tarea en un estado que admita esa transición.

Las acciones se implementan como formularios HTML y usan el patrón POST/Redirect/GET. El cliente del coordinator envía JSON a sus rutas públicas y valida la entidad de respuesta antes de confirmar el éxito.

El límite HTTP del dashboard:

- acepta únicamente `application/x-www-form-urlencoded`;
- limita cada cuerpo a 16 KiB y cada campo a una longitud explícita;
- rechaza campos desconocidos o repetidos;
- exige un encabezado `Origin` cuyo host coincida con `Host` y rechaza solicitudes marcadas como cross-site;
- mantiene CSP, escape HTML, `no-store`, protección contra framing y logs estructurados sin contenido del usuario.

El dashboard no expone claim, asignación, heartbeat ni transiciones de éxito o fallo. Esas operaciones permanecen bajo control de los agentes y del coordinator.

## Consecuencias

- El operador puede iniciar y detener trabajo desde el navegador sin acceso a la base de datos.
- La validación y las transiciones siguen teniendo una única autoridad en el coordinator.
- Crear una tarea puede provocar trabajo posterior de un agente, pero no escribe directamente en Minecraft.
- La recarga posterior a una escritura evita reenvíos involuntarios.
- La protección de origen mitiga CSRF, pero no autentica al operador. El despliegue debe mantener el puerto en loopback o añadir un proxy autenticado antes de exponerlo.
- Autenticación, autorización por rol y confirmaciones reforzadas quedan como trabajo futuro.
