# Frontend Dockerfile for Cloud Run (Multi-stage: Builder -> Runner)
# ================================================================
# Builder stage
FROM node:22-alpine AS builder

WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm ci

# ソースコピー・ビルド
COPY . .
RUN npm run build

# ================================================================
# Runner stage (standalone output)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# standalone で必要なファイルのみコピー
COPY --from=builder /app/public* ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 非rootユーザー
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
USER nextjs

ENV PORT=3000
EXPOSE 3000

# standalone で生成される server.js を実行
CMD ["node", "server.js"]
