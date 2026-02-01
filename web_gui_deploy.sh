#!/bin/bash
# NDT Application Deployment Script
echo "Starting deployment of NDT application..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed, please install Docker first"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "Docker Compose (Plugin) is not installed."
    exit 1
fi

# Check environment variables file
if [ ! -f .env ]; then
    echo "Creating environment variables file..."
    cp .env.example .env
    echo ".env file created, please modify the configuration as needed"
    echo "Please ensure you modify the following configurations:"
    echo " - NDT_API_BASE_URL: your NDT server address"
    echo " - DB_PASSWORD: database password"
    read -p "Press Enter to continue deployment, or Ctrl+C to cancel..."
fi

# Stop existing containers
echo "Stopping existing containers..."
docker compose down

# Remove old containers and volumes if needed
echo "Cleaning up old containers and volumes..."
docker compose down -v --remove-orphans

# Build and start containers
echo " Building and starting containers..."
docker compose up --build -d

# Check if containers started successfully
if [ $? -ne 0 ]; then
    echo "Failed to start containers. Check the logs:"
    docker compose logs
    exit 1
fi

# Wait for services to start
echo "Waiting for services to start..."
sleep 15

# Check service status
echo "Checking service status..."
docker compose ps

# Check if all services are running
if docker compose ps | grep -q "Exit"; then
    echo "Some services failed to start. Check the logs:"
    docker compose logs
    exit 1
fi

echo ""
echo "Deployment completed!"
echo ""
echo "Application access addresses:"
echo "   Frontend: http://localhost:3000"
echo "   Database: localhost:5433"
echo ""
echo "Common commands:"
echo "   View logs: docker compose logs -f"
echo "   Stop services: docker compose down"
echo "   Restart services: docker compose restart"
echo "   Update deployment: ./deploy.sh"
echo "   View specific service logs: docker compose logs -f [service_name]"
echo ""
echo "Note: If you can't access the application, check:"
echo "   - Firewall settings"
echo "   - Port availability (3000, 5433)"
echo "   - Docker service status"
