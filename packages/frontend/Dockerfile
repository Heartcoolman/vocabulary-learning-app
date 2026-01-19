# =============================================================================
# Danci Frontend Dockerfile for Zeabur
# Build context: repo root, Dockerfile location: packages/frontend/
# =============================================================================

FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/frontend ./packages/frontend
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

WORKDIR /app/packages/frontend
RUN pnpm build

FROM nginx:alpine

COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
