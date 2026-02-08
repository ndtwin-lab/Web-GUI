# NDTwin Web GUI Deployment and Execution Guide

## Overview

This guide will help you deploy and run the NDTwin Web GUI application on Ubuntu systems. The application is containerized using Docker and Docker Compose, allowing for quick deployment without polluting your system environment.

**Important Notes:**

- The application uses `localhost:3000` as the default frontend service port
- This guide is primarily written for Ubuntu systems, but the application can also run on other Linux distributions
- Different Linux distributions require their corresponding package managers for installation

## Prerequisites

Before starting the deployment, ensure your system meets the following requirements:

- Ubuntu operating system (or other Linux distribution)
- Administrator privileges (sudo)
- Internet connection (for downloading Docker and related packages)

## Installing Required Tools

### Step 1: Update System Packages

First, update the system package list and upgrade existing packages:

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Docker

Install necessary dependencies:

```bash
sudo apt install -y ca-certificates curl gnupg
```

Add Docker official GPG key:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Setup Docker official repository:

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Update package:

```bash
sudo apt update
```

Install Docker and its related components:

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Step 3: Add User to Docker Group

To avoid needing `sudo` for every Docker command, add the current user to the Docker group:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
```

**Important:** After executing the above commands, you need to log out and log back in, or execute the following command to make the group change take effect immediately:

```bash
newgrp docker
```

### Step 4: Start Docker Service

Start the Docker service and enable it to start on boot:

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Step 5: Verify Docker Installation

Verify that Docker is correctly installed:

```bash
docker --version
docker compose version
```

If both commands display version numbers, the installation is successful.

## Starting Application Deployment

### Step 1: Prepare Project Files

If you received a ZIP archive, extract it first:

```bash
unzip NDTwin_Web_GUI_release.zip
cd NDTwin_Web_GUI
```

If you cloned from a Git repository, execute:

```bash
git clone <repository-url>
cd Web_GUI/
```

### Step 2: Configure Environment Variables

**IMPORTANT: You must configure the `.env` file before running the deployment script.**

In the project root directory, you need to create and configure the `.env` file from the template.

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Edit the `.env` file\*\* and update the NDTwin kernel server address:

```bash
vim .env
# Or use other editors like nano, Emacs, etc.
```

3. Configure the NDT API Base URL:
Find the `NDT_API_BASE_URL` line in the `.env` file and update it to your NDT kernel server IP address.
For example, if your NDTwin kernel server (mininet or testbed) is running at `http://192.168.10.189:8000`, set it as:
```bash
NDT_API_BASE_URL=http://192.168.10.189:8000
```
If your server is at a different address, modify accordingly.

**This is a required configuration** - the application will not work correctly without the correct NDTwin kernel server address.

### Step 3: Execute Deployment Script

Ensure the deployment script has execute permissions:

```bash
sudo chmod +x web_gui_deploy.sh
```

Execute the deployment script:

```bash
./web_gui_deploy.sh
```

The deployment script will automatically perform the following operations:

1. Check if Docker and Docker Compose are installed
2. Check and create `.env` file (if it doesn't exist, it will copy from `.env.example`)
3. Stop existing containers (if any)
4. Clean up old containers and volumes
5. Build Docker images
6. Start all service containers
7. Check service status

After deployment completes, you should see output similar to:

```
Application access addresses:
   Frontend: http://localhost:3000
   Database: localhost:5433
```

### Step 4: Verify Deployment

Open your browser and visit `http://localhost:3000`. You should see the NDTwin Web GUI application interface.

If you cannot access it, check:

1. Whether containers are running:

```bash
docker compose ps
```

2. View service logs:

```bash
docker compose logs -f
```

## Daily Usage

### Starting the Application

**Important:** You only need to run `./web_gui_deploy.sh` **once** during the initial setup. After the first deployment, you can start the application using Docker Compose commands.

To start the application after the initial deployment:

1. **Ensure Docker is running:**
   ```bash
   sudo systemctl status docker
   ```
   If Docker is not running, start it:
   ```bash
   sudo systemctl start docker
   ```

2. **Navigate to the project root directory:**
   ```bash
   cd /path/to/NDTwin_Web_GUI
   ```

3. **Start all services:**
   ```bash
   docker compose up -d
   ```
   The `-d` flag runs containers in detached mode (in the background).

4. **Verify services are running:**
   ```bash
   docker compose ps
   ```
   You should see all three services (postgres, node-positions-api, frontend) with status "Up".

5. **Access the application:**
   Open your browser and visit `http://localhost:3000`.

### Stopping the Application

To stop all services:

```bash
docker compose down
```

This will stop all containers but preserve the data volumes (database data will be retained).

To stop and remove all data volumes (this will delete database data):

```bash
docker compose down -v
```

**Warning:** Using `-v` will permanently delete all database data. Only use this if you want to start fresh.

### Restarting Services

To restart all services:

```bash
docker compose restart
```

To restart a specific service (e.g., frontend):

```bash
docker compose restart frontend
```

### Viewing Service Status

Check the status of all containers:

```bash
docker compose ps
```

### Viewing Logs

View logs from all services:

```bash
docker compose logs -f
```

View logs from a specific service:

```bash
docker compose logs -f frontend
docker compose logs -f node-positions-api
docker compose logs -f postgres
```

Press `Ctrl+C` to exit log viewing.

### When to Re-run `./web_gui_deploy.sh`

You only need to run `./web_gui_deploy.sh` again if:

- You modified the `.env` file (especially `NDT_API_BASE_URL`) and need to rebuild the frontend image
- You updated the application code and need to rebuild Docker images
- You want to completely reset the deployment (removes containers and volumes)

For normal daily usage, simply use `docker compose up -d` to start the services.

## Advanced Configuration

### Modifying Service Ports

If you need to modify the frontend or database ports, edit the port mappings in the `docker-compose.yml` file:

```yaml
ports:
  - '3000:3000' # Frontend port: host_port:container_port
  - '5433:5432' # Database port: host_port:container_port
```

After modification, restart the services:

```bash
docker compose down
docker compose up -d
```

### Database Backup

Backup PostgreSQL data:

```bash
# Replace 'user' with your actual DB_USER from .env file (default is 'user' in docker-compose.yml)
docker exec ndt-postgres pg_dump -U user ndtdb > backup.sql
```

Restore data:

```bash
# Replace 'user' with your actual DB_USER from .env file (default is 'user' in docker-compose.yml)
docker exec -i ndt-postgres psql -U user ndtdb < backup.sql
```

**Note:** The default database user is `user` (as defined in `docker-compose.yml`). If you changed `DB_USER` in your `.env` file, replace `user` with your actual database username in the commands above.
