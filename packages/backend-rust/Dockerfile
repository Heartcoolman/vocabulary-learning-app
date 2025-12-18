# =============================================================================
# Danci Rust Backend Dockerfile
# Build from project root: docker build -f packages/backend-rust/Dockerfile -t danci-backend-rust .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Chef - Prepare recipe for dependency caching
# -----------------------------------------------------------------------------
FROM rust:1.75-slim-bookworm AS chef

RUN cargo install cargo-chef --locked
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Planner - Analyze dependencies
# -----------------------------------------------------------------------------
FROM chef AS planner

# Copy all workspace members for dependency analysis
COPY packages/backend-rust/Cargo.toml packages/backend-rust/Cargo.lock* ./packages/backend-rust/
COPY crates/danci-algo/Cargo.toml ./crates/danci-algo/
COPY packages/native/Cargo.toml ./packages/native/

# Copy source files
COPY packages/backend-rust/src ./packages/backend-rust/src
COPY crates/danci-algo/src ./crates/danci-algo/src
COPY packages/native/src ./packages/native/src

WORKDIR /app/packages/backend-rust
RUN cargo chef prepare --recipe-path recipe.json

# -----------------------------------------------------------------------------
# Stage 3: Builder - Build dependencies and application
# -----------------------------------------------------------------------------
FROM chef AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy recipe and build dependencies first (cache layer)
COPY --from=planner /app/packages/backend-rust/recipe.json ./packages/backend-rust/recipe.json

# Copy workspace member Cargo.toml files
COPY crates/danci-algo/Cargo.toml ./crates/danci-algo/
COPY packages/native/Cargo.toml ./packages/native/

# Create stub source files for dependency compilation
RUN mkdir -p crates/danci-algo/src packages/native/src && \
    echo "pub fn stub() {}" > crates/danci-algo/src/lib.rs && \
    echo "pub fn stub() {}" > packages/native/src/lib.rs

WORKDIR /app/packages/backend-rust
RUN cargo chef cook --release --recipe-path recipe.json || true

# Now copy actual source code
COPY packages/backend-rust/Cargo.toml packages/backend-rust/Cargo.lock* ./
COPY packages/backend-rust/src ./src
COPY crates/danci-algo/src /app/crates/danci-algo/src
COPY packages/native/src /app/packages/native/src

# Build the application
RUN cargo build --release && \
    cp target/release/danci-backend-rust /app/danci-backend-rust || \
    cp target/release/danci_backend_rust /app/danci-backend-rust && \
    strip /app/danci-backend-rust

# -----------------------------------------------------------------------------
# Stage 4: Runner - Production image
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd --system --gid 1001 danci && \
    useradd --system --uid 1001 --gid danci danci

COPY --from=builder /app/danci-backend-rust ./danci-backend-rust

RUN mkdir -p /app/data && chown -R danci:danci /app

USER danci

ENV RUST_LOG=info
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["./danci-backend-rust"]
