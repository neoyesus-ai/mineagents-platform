FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY observability ./observability
COPY minecraft-adapter ./minecraft-adapter
COPY coordinator ./coordinator
COPY sdk ./sdk
COPY planner ./planner
COPY memory ./memory
COPY dashboard ./dashboard
COPY blueprints ./blueprints
COPY agents ./agents

RUN npm ci

RUN npm run build --workspace @mineagents/observability \
    && npm run build --workspace @mineagents/sdk \
    && npm run build --workspace @mineagents/planner \
    && npm run build --workspace @mineagents/coordinator

FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /workspace/sdk/package.json \
  ./node_modules/@mineagents/sdk/package.json

COPY --from=build /workspace/sdk/dist \
  ./node_modules/@mineagents/sdk/dist

COPY --from=build /workspace/observability/package.json \
  ./node_modules/@mineagents/observability/package.json

COPY --from=build /workspace/observability/dist \
  ./node_modules/@mineagents/observability/dist

COPY --from=build /workspace/planner/package.json \
  ./node_modules/@mineagents/planner/package.json

COPY --from=build /workspace/planner/dist \
  ./node_modules/@mineagents/planner/dist

COPY --from=build /workspace/coordinator/package.json \
  ./coordinator/package.json

COPY --from=build /workspace/coordinator/dist \
  ./coordinator/dist

WORKDIR /app/coordinator

EXPOSE 3000

CMD ["node", "--no-warnings", "dist/cli.js"]