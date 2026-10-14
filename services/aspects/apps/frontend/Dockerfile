# ─── Stage 1: build ───
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN corepack enable

# Копируем workspace-манифесты (для кэша слоёв)
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/cards/package.json  ./packages/cards/package.json
COPY packages/bot/package.json    ./packages/bot/package.json
COPY apps/frontend/package.json   ./apps/frontend/package.json

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile=false

# Копируем исходники
COPY packages/shared ./packages/shared
COPY packages/engine ./packages/engine
COPY packages/cards  ./packages/cards
COPY packages/bot    ./packages/bot
COPY apps/frontend   ./apps/frontend

RUN pnpm --filter @aspects/frontend build

# ─── Stage 2: runtime ───
FROM nginx:1.27-alpine AS runtime

RUN mkdir -p /usr/share/nginx/html/games/aspects
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html/games/aspects
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8011