FROM node:20-alpine AS base
RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/indexer/package.json packages/indexer/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/indexer/ packages/indexer/

RUN pnpm --filter @oracle-index/shared build && pnpm --filter @oracle-index/indexer build

FROM node:20-alpine
RUN corepack enable pnpm

WORKDIR /app
COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/packages/shared/package.json packages/shared/
COPY --from=base /app/packages/shared/dist packages/shared/dist/
COPY --from=base /app/packages/indexer/package.json packages/indexer/
COPY --from=base /app/packages/indexer/dist packages/indexer/dist/
COPY --from=base /app/packages/indexer/src/schema.sql packages/indexer/dist/schema.sql

RUN pnpm install --frozen-lockfile --prod

CMD ["node", "packages/indexer/dist/index.js"]
