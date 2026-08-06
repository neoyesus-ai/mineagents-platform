FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY observability ./observability
COPY sdk ./sdk
COPY minecraft-adapter ./minecraft-adapter
COPY coordinator ./coordinator
COPY agents ./agents
COPY planner ./planner
COPY memory ./memory
COPY dashboard ./dashboard
COPY blueprints ./blueprints

RUN npm ci
RUN npm run build --workspace @mineagents/observability \
    && npm run build --workspace @mineagents/sdk \
    && npm run build --workspace @mineagents/dashboard

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /workspace/sdk/package.json ./node_modules/@mineagents/sdk/package.json
COPY --from=build /workspace/sdk/dist ./node_modules/@mineagents/sdk/dist
COPY --from=build /workspace/observability/package.json ./node_modules/@mineagents/observability/package.json
COPY --from=build /workspace/observability/dist ./node_modules/@mineagents/observability/dist
COPY --from=build /workspace/dashboard/package.json ./dashboard/package.json
COPY --from=build /workspace/dashboard/dist ./dashboard/dist

WORKDIR /app/dashboard
EXPOSE 3001
CMD ["node", "dist/cli.js"]
