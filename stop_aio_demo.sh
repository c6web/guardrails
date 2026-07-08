set -e

docker compose --env-file .env.demo -f docker-compose-demo.yml down

echo ""
echo "====================================="
echo " AI Firewall Gateway — Demo Stopped"
echo "====================================="
echo ""
