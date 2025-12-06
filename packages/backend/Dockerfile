# ============================================
# 后端 Dockerfile - 多阶段构建 (Monorepo 版本)
# ============================================
# 注意：需要从 Monorepo 根目录构建
# docker build -f packages/backend/Dockerfile -t danci-backend .

# Stage 1: 依赖安装
FROM node:20-alpine AS deps
WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# 复制 Monorepo 配置文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/

# 安装依赖（只安装 backend 和 shared）
RUN pnpm install --frozen-lockfile --filter @danci/backend...

# Stage 2: 构建
FROM node:20-alpine AS builder
WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# 复制源代码
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 生成 Prisma 客户端并构建
WORKDIR /app/packages/backend
RUN npx prisma generate
RUN pnpm run build

# Stage 3: 生产镜像
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 安装 OpenSSL（Prisma 需要）
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

# 复制构建产物
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/node_modules ./node_modules
COPY --from=builder /app/packages/backend/package.json ./
COPY --from=builder /app/packages/backend/prisma ./prisma

# 复制 shared 包（运行时可能需要）
COPY --from=builder /app/packages/shared ./packages/shared

# 设置权限
RUN chown -R expressjs:nodejs /app

COPY packages/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER expressjs

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
