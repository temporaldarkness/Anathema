FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN addgroup -S -g 1001 sveltekit
RUN adduser -S -u 1001 -G sveltekit sveltekit

COPY --from=builder --chown=sveltekit:sveltekit /app/build ./build
COPY --from=builder --chown=sveltekit:sveltekit /app/node_modules ./node_modules
COPY --chown=sveltekit:sveltekit package.json .

USER sveltekit
EXPOSE 3000

CMD ["node", "build/index.js"]