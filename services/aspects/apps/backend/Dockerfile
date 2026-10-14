# ─── Stage 1: build (всё в одном слое) ───
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl
RUN corepack enable

# Манифесты для установки зависимостей
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/cards/package.json  ./packages/cards/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/bot/package.json    ./packages/bot/package.json
COPY apps/backend/package.json    ./apps/backend/package.json

# Устанавливаем ВСЁ, включая workspace-пакеты
RUN pnpm install --frozen-lockfile=false

# Копируем исходники всех пакетов
COPY packages ./packages
COPY apps/backend ./apps/backend

# Собираем пакеты в правильном порядке
RUN pnpm --filter @aspects/shared build \
 && pnpm --filter @aspects/cards  build \
 && pnpm --filter @aspects/engine build \
 && pnpm --filter @aspects/bot    build

# Prisma generate + backend build
RUN cd apps/backend \
 && pnpm prisma generate \
 && pnpm build

# ─── Stage 2: runtime ───
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl
ENV NODE_ENV=production

# Копируем ВСЁ из build. Это большая, но рабочая опция для монорепы с pnpm:
# симлинки, вложенные node_modules, dist-пакеты — всё сохраняется.
COPY --from=build /app /app

WORKDIR /app/apps/backend

EXPOSE 8010

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]