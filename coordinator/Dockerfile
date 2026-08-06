FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY coordinator ./coordinator
COPY sdk ./sdk
COPY planner ./planner
COPY memory ./memory
COPY dashboard ./dashboard
COPY blueprints ./blueprints
COPY agents ./agents

RUN npm install
RUN npm run build --workspace @mineagents/coordinator

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/coordinator/package.json ./coordinator/package.json
COPY --from=build /workspace/coordinator/dist ./coordinator/dist

WORKDIR /app/coordinator
EXPOSE 3000
CMD ["node", "dist/cli.js"]
