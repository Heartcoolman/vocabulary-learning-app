# =============================================================================
# Danci Backend Dockerfile with Native Rust Module Support
# Build from project root: docker build -f packages/backend/Dockerfile -t danci-backend .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 0: Rust builder - Build native LinUCB module
# -----------------------------------------------------------------------------
FROM rust:1.75-alpine AS rust-builder

# Install build dependencies for Alpine
RUN apk add --no-cache \
    musl-dev \
    openssl-dev \
    pkgconfig \
    nodejs \
    npm \
    python3 \
    make \
    gcc \
    g++

WORKDIR /app/packages/native

# Copy Rust project files
COPY packages/native/Cargo.toml packages/native/Cargo.lock* ./
COPY packages/native/build.rs ./
COPY packages/native/src ./src
COPY packages/native/package.json ./

# Install napi-rs CLI and build
RUN npm install @napi-rs/cli
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 1: Dependencies - Install Node.js dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/native/package.json ./packages/native/

# Copy native build artifacts from rust-builder
COPY --from=rust-builder /app/packages/native/*.node ./packages/native/
COPY --from=rust-builder /app/packages/native/index.js ./packages/native/
COPY --from=rust-builder /app/packages/native/index.d.ts ./packages/native/

# Install pnpm and dependencies
RUN corepack enable pnpm && \
    pnpm install --frozen-lockfile --prod

# -----------------------------------------------------------------------------
# Stage 2: Builder - Build TypeScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY packages/backend ./packages/backend
COPY tsconfig.json ./

# Build TypeScript
RUN corepack enable pnpm && \
    cd packages/backend && pnpm run build

# -----------------------------------------------------------------------------
# Stage 3: Runner - Production image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 danci

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/native ./packages/native

# Copy built application
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/package.json ./packages/backend/

# Set ownership
RUN chown -R danci:nodejs /app

USER danci

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/backend/dist/index.js"]
