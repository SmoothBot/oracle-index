FROM node:20-alpine AS build
RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/dashboard/package.json packages/dashboard/
RUN pnpm install --frozen-lockfile

COPY packages/dashboard/ packages/dashboard/

RUN pnpm --filter @oracle-index/dashboard build

FROM nginx:alpine
COPY --from=build /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
