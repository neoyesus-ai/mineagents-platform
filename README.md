# MineAgents Platform

Monorepositorio TypeScript modular para agentes colaborativos de Minecraft Java Edition.

> Estructura inicial: sin integracion con Minecraft ni LLM.

## Modulos

- `apps/coordinator`: servicio central y health check.
- `apps/dashboard`: futura interfaz operativa.
- `agents`: recolector y constructor.
- `packages/sdk`: contratos compartidos.
- `packages/planner`: contratos de planificacion.
- `packages/memory`: abstraccion de memoria.
- `packages/blueprints`: formato de planos.

## Inicio

```bash
cp .env.example .env
npm install
npm run check
npm run dev --workspace @mineagents/coordinator
```

El coordinador expone `GET /health` en `http://localhost:3000`.

## Docker

```bash
docker compose up --build
```

## Documentacion

- [Arquitectura](docs/architecture.md)
- [Vision](docs/vision.md)
- [Roadmap](docs/roadmap.md)

Requiere Node.js 22+ y npm 10+. No almacenes credenciales ni permitas mutaciones del mundo fuera de tareas y areas autorizadas.
