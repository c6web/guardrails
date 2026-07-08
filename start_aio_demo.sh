set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/nginx/certs"

# Generate self-signed TLS cert for demo1.c6web.com if missing
if [ ! -f "$CERTS_DIR/demo1.c6web.com.crt" ]; then
  echo "Generating self-signed TLS certificate..."
  mkdir -p "$CERTS_DIR"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/demo1.c6web.com.key" \
    -out "$CERTS_DIR/demo1.c6web.com.crt" \
    -subj "/CN=demo1.c6web.com" \
    -addext "subjectAltName=DNS:demo1.c6web.com" 2>/dev/null
fi

docker compose --env-file .env.demo -f docker-compose-demo.yml down
docker compose --env-file .env.demo -f docker-compose-demo.yml up --build -d

echo ""
echo "Waiting for Postgres to be ready..."
until docker exec demo-postgres pg_isready -q 2>/dev/null; do
  sleep 1
done

echo "Waiting for backend to be ready..."
# Migrations + seeds run automatically in the backend entrypoint (tracked via
# SequelizeMeta / SequelizeData) before the app starts — no separate step needed here.
until docker exec demo-backend curl -sf http://localhost:3635/health 2>/dev/null; do
  sleep 2
done

echo ""
echo "====================================="
echo " AI Firewall Gateway — Demo Started"
echo "====================================="
echo ""
echo " Frontend : http://<host-ip>:3634  (HTTP)"
echo "            https://<host-ip>:3635 (HTTPS)"
echo "            https://demo1.c6web.com"
echo "            (add 127.0.0.1 demo1.c6web.com to /etc/hosts)"
echo ""
echo " Backend  : http://<host-ip>:3635/api (via nginx)"
echo ""
echo " Gateway  : http://<host-ip>:8083 (via nginx)"
echo "            http://localhost:8082 (direct)"
echo ""
echo " Login    : admin / password"
echo "====================================="
echo ""
