FROM rust:1.95-slim AS builder
WORKDIR /app
# Copy manifests first so dependency layer is cached independently of src changes
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
# curl is only for HEALTHCHECK — no other runtime tools needed
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/c6-guardrails-gateway-engine /gateway-engine

EXPOSE 8082

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8082/health || exit 1

ENTRYPOINT ["/gateway-engine"]
