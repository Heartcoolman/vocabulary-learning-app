# Zeabur Backend Build - delegates to actual Dockerfile
# This file exists because Zeabur requires Dockerfile at build context root

FROM rust:slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY crates/danci-algo ./crates/danci-algo
COPY packages/native ./packages/native
COPY packages/backend-rust ./packages/backend-rust

WORKDIR /app/packages/backend-rust

RUN cargo build --release && \
    cp target/release/danci-backend-rust /app/danci-backend-rust || \
    cp target/release/danci_backend_rust /app/danci-backend-rust && \
    strip /app/danci-backend-rust

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
