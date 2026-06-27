# Local Development Setup

This guide walks through setting up the full development environment on your local VM.

## Prerequisites

Install the following on your VM:

```bash
# Python
sudo apt install python3.11 python3.11-venv python3-pip

# Node.js (for React)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# PostgreSQL
sudo apt install postgresql postgresql-contrib

# Nginx
sudo apt install nginx

# Git
sudo apt install git
```

## PostgreSQL Setup

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create dev database and user
sudo -u postgres psql
CREATE USER ticketing_user WITH PASSWORD 'your_password';
CREATE DATABASE ticketing_dev OWNER ticketing_user;
\q
```

## Backend Setup

```bash
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your local values

# Run database migrations
alembic upgrade head

# Start FastAPI (runs on port 8000 by default)
uvicorn main:app --reload --port 8000
```

## Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your local values

# Start Vite dev server (runs on port 5173 by default)
npm run dev
```

## Nginx Setup

Nginx acts as a reverse proxy in development — serves the frontend and proxies API calls to FastAPI.

Create the config file:

```bash
sudo nano /etc/nginx/sites-available/ticketing
```

Paste:

```nginx
server {
    listen 80;
    server_name localhost;

    # Proxy frontend (Vite dev server)
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy API calls to FastAPI
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and start:

```bash
sudo ln -s /etc/nginx/sites-available/ticketing /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Visit `http://localhost` to see the app.

## Environment Variables

### Backend `.env`
```
DATABASE_URL=postgresql://ticketing_user:your_password@localhost/ticketing_dev
CLERK_SECRET_KEY=your_clerk_secret_key
ENVIRONMENT=development
```

### Frontend `.env.local`
```
VITE_API_URL=http://localhost/api
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

## Verifying Everything Works

```bash
# Check FastAPI is running
curl http://localhost:8000/health

# Check Nginx is proxying correctly
curl http://localhost/api/health

# Check frontend loads
open http://localhost
```
