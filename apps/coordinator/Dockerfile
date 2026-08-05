FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/coordinator/package.json apps/coordinator/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY agents/gatherer/package.json agents/gatherer/package.json
COPY agents/builder/package.json agents/builder/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/planner/package.json packages/planner/package.json
COPY packages/memory/package.json packages/memory/package.json
COPY packages/blueprints/package.json packages/blueprints/package.json
RUN npm install
COPY apps apps
COPY agents agents
COPY packages packages
COPY tests tests
COPY docs docs
COPY scripts scripts
RUN npm run check && npm run build --workspace @mineagents/coordinator

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/apps/coordinator/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
