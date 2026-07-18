# Frontend Dockerfile for Cloud Run (Multi-stage: Builder -> Runner)
# ================================================================
# Builder stage
FROM node:22-alpine AS builder

WORKDIR /app

# ビルド時の環境変数を受け取る
ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID

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
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# public ディレクトリがあればコピー
COPY --from=builder /app/public* ./public/

# 非rootユーザー
RUN addgroup --system --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
USER nextjs

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
