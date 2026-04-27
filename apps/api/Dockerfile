# Multi-stage build for the Aloy API.
# Build context is the repo root (see docker-compose.yaml).

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json turbo.json ./
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/api/package.json ./apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/sdk ./packages/sdk
COPY apps/api ./apps/api
RUN pnpm --filter aloy build && pnpm --filter @aloy/api build
RUN pnpm --filter @aloy/api deploy --prod /export
RUN cp -R apps/api/dist /export/dist && cp -R apps/api/migrations /export/migrations

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /export ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
