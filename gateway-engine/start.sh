#!/usr/bin/env bash
set -euo pipefail

echo "=== GatewayEngine: direct compile + start ==="

# Build in release mode
cargo build --release

# Run the binary directly (reads .env or env vars from shell)
exec target/release/gateway-engine
