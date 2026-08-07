# ADR 0010: movimiento Mineflayer acotado

## Estado

Aceptada.

## Contexto

El driver real ya demuestra conexión, inspección y ciclo de vida contra el mundo desechable. El siguiente incremento necesita desplazar un agente sin convertir el pathfinder en una vía para modificar el mundo o abandonar el área autorizada por SafeMinecraftAdapter.

## Decisión

MineflayerDriver.moveTo exigirá una o más regiones explícitas. Tanto la posición inicial como el destino deben pertenecer a ellas y usar la dimensión activa del bot.

Un controlador dedicado configurará mineflayer-pathfinder con un perfil conservador:

- no excavará, colocará bloques ni usará andamiaje;
- no abrirá puertas, hará parkour ni correrá;
- excluirá del cálculo los pasos fuera de las regiones recibidas;
- vigilará la posición durante el movimiento y detendrá cualquier salida;
- ejecutará una sola orden a la vez y aplicará un timeout configurable.

Al terminar, el driver comprobará que alcanzó exactamente el destino. Los fallos del pathfinder se convertirán en errores acotados del driver. placeBlock y breakBlock seguirán devolviendo UNSUPPORTED_OPERATION.

El servicio mineflayer-observer cargará el plugin para que el driver esté listo, pero no ofrecerá un endpoint ni consumirá tareas de movimiento. Habilitar movimiento en un agente seguirá requiriendo una política explícita de SafeMinecraftAdapter.

## Consecuencias

- El driver aplica las regiones incluso si se invoca directamente.
- El pathfinding no tiene permiso para alterar bloques para completar una ruta.
- Un timeout, desconexión o salida de región detiene la operación.
- El movimiento real ya se verificó en el servidor desechable con ida, regreso e instantáneas de bloques intactas; las escrituras autorizadas y el flujo integral siguen pendientes.
