#!/usr/bin/env bash
set -e

OUT_DIR="docker-image"
mkdir -p "$OUT_DIR"

echo "============================================"
echo " Building AI Firewall Gateway — All-in-One"
echo "============================================"
echo ""

# --- Build backend image ---
echo "[1/3] Building backend image..."
docker build --no-cache \
  -t afw-demo-backend:latest \
  -f backend/Dockerfile.demo \
  backend/
echo "       Saving backend image..."
docker save afw-demo-backend:latest -o "$OUT_DIR/afw-demo-backend.tar"
echo "       Done."
echo ""

# --- Build frontend image ---
echo "[2/3] Building frontend image..."
docker build --no-cache \
  -t afw-demo-frontend:latest \
  -f frontend/Dockerfile.demo \
  frontend/
echo "       Saving frontend image..."
docker save afw-demo-frontend:latest -o "$OUT_DIR/afw-demo-frontend.tar"
echo "       Done."
echo ""

# --- Build gateway-engine image ---
echo "[3/3] Building gateway-engine image (Rust compile may take a while)..."
docker build --no-cache \
  -t afw-demo-gateway-engine:latest \
  -f gateway-engine/Dockerfile \
  gateway-engine/
echo "       Saving gateway-engine image..."
docker save afw-demo-gateway-engine:latest -o "$OUT_DIR/afw-demo-gateway-engine.tar"
echo "       Done."
echo ""

echo "============================================"
echo " All images built and saved to: $OUT_DIR/"
echo "============================================"
echo ""
ls -lh "$OUT_DIR"/
echo ""
echo "============================================"
echo " To deploy on a remote machine:"
echo "============================================"
echo ""
echo " 1. Copy the docker-image/ folder to the remote machine:"
echo "    scp -r docker-image/ user@remote:~/"
echo ""
echo " 2. SSH into the remote machine and load the images:"
echo "    ssh user@remote"
echo "    cd ~/docker-image"
echo "    docker load -i afw-demo-backend.tar"
echo "    docker load -i afw-demo-frontend.tar"
echo "    docker load -i afw-demo-gateway-engine.tar"
echo ""
echo " 3. Start the stack (auto-creates .env, certs, and docker-compose.yml):"
echo "    ./start_aio_demo_image.sh"
echo ""
echo "    The postgres image (pgvector/pgvector:pg17) is public on Docker Hub"
echo "    and will be pulled automatically by docker compose."
echo ""
echo " 4. Check logs:"
echo "    docker compose logs -f"
echo ""
echo "============================================"
