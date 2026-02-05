FROM node:20-alpine AS base
RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

RUN pnpm --filter @oracle-index/shared build && pnpm --filter @oracle-index/api build

FROM node:20-alpine
RUN corepack enable pnpm

WORKDIR /app
COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/packages/shared/package.json packages/shared/
COPY --from=base /app/packages/shared/dist packages/shared/dist/
COPY --from=base /app/packages/api/package.json packages/api/
COPY --from=base /app/packages/api/dist packages/api/dist/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]
