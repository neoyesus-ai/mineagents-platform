FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY observability ./observability
COPY minecraft-adapter ./minecraft-adapter
COPY minecraft-driver-mineflayer ./minecraft-driver-mineflayer
COPY coordinator ./coordinator
COPY sdk ./sdk
COPY planner ./planner
COPY memory ./memory
COPY dashboard ./dashboard
COPY blueprints ./blueprints
COPY agents ./agents

RUN npm ci
RUN npm run build --workspace @mineagents/observability \
    && npm run build --workspace @mineagents/minecraft-adapter \
    && npm run build --workspace @mineagents/mineflayer-driver
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/observability ./observability
COPY --from=build /workspace/minecraft-adapter ./minecraft-adapter
COPY --from=build /workspace/minecraft-driver-mineflayer ./minecraft-driver-mineflayer

WORKDIR /app/minecraft-driver-mineflayer
CMD ["node", "dist/cli.js"]
