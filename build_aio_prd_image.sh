#!/usr/bin/env bash
set -e

OUT_DIR="docker-image"
mkdir -p "$OUT_DIR"

echo "============================================"
echo " Building AI Firewall Gateway — Production"
echo "============================================"
echo ""

# --- Build backend image ---
echo "[1/3] Building backend image..."
docker build --no-cache \
  -t afw-prd-backend:latest \
  -f backend/Dockerfile.demo \
  backend/
echo "       Saving backend image..."
docker save afw-prd-backend:latest -o "$OUT_DIR/afw-prd-backend.tar"
echo "       Done."
echo ""

# --- Build frontend image ---
echo "[2/3] Building frontend image..."
docker build --no-cache \
  -t afw-prd-frontend:latest \
  -f frontend/Dockerfile.demo \
  frontend/
echo "       Saving frontend image..."
docker save afw-prd-frontend:latest -o "$OUT_DIR/afw-prd-frontend.tar"
echo "       Done."
echo ""

# --- Build gateway-engine image ---
echo "[3/3] Building gateway-engine image (Rust compile may take a while)..."
docker build --no-cache \
  -t afw-prd-gateway-engine:latest \
  -f gateway-engine/Dockerfile \
  gateway-engine/
echo "       Saving gateway-engine image..."
docker save afw-prd-gateway-engine:latest -o "$OUT_DIR/afw-prd-gateway-engine.tar"
echo "       Done."
echo ""

echo "============================================"
echo " All production images built and saved to: $OUT_DIR/"
echo "============================================"
echo ""
ls -lh "$OUT_DIR"/
echo ""
echo "============================================"
echo " To deploy on a production machine:"
echo "============================================"
echo ""
echo " 1. Copy the docker-image/ folder to the production host:"
echo "    scp -r docker-image/ user@prod-host:~/"
echo ""
echo " 2. SSH into the production host and load the images:"
echo "    ssh user@prod-host"
echo "    cd ~/docker-image"
echo "    docker load -i afw-prd-backend.tar"
echo "    docker load -i afw-prd-frontend.tar"
echo "    docker load -i afw-prd-gateway-engine.tar"
echo ""
echo " 3. Create .env with production secrets (see docs/production-hardening.md):"
echo "    cp .env.example .env"
echo "    # Edit .env — generate all secrets with openssl rand"
echo ""
echo " 4. Create docker-compose.yml using afw-prd-* image names"
echo "    and start the stack:"
echo "    docker compose --env-file .env -f docker-compose.yml up -d"
echo ""
echo "    The postgres image (pgvector/pgvector:pg17) is public on Docker Hub"
echo "    and will be pulled automatically by docker compose."
echo ""
echo " 5. Configure TLS with Let's Encrypt and update nginx config."
echo ""
echo " 6. Check logs:"
echo "    docker compose logs -f"
echo ""
echo "============================================"
