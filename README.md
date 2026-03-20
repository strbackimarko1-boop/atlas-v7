# ATLAS — Signal Dashboard

A two-engine trading signal system. Scans stocks, crypto, and leveraged ETFs against a 14-rule scoring engine. Gives exact entry/stop/target levels with position sizing.

## Architecture

```
atlas-api/   → FastAPI backend (Python) — scoring engine + data
atlas-app/   → React frontend (Vite)   — dashboard UI
```

## Quick Start (Local Development)

### 1. Start the API
```bash
cd atlas-api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Test: `curl http://localhost:8000/api/gate`

### 2. Start the Frontend
```bash
cd atlas-app
npm install
npm run dev
```

Open: `http://localhost:3000`

Vite automatically proxies `/api/*` to `localhost:8000`.

## Deploy to Hetzner (Docker Compose)

### 1. Set up the server
```bash
# SSH into your Hetzner CX22
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose -y
```

### 2. Clone and deploy
```bash
git clone https://github.com/strbackimarko1-boop/atlas-dashboard.git
cd atlas-dashboard

# Create .env from template
cp .env.example .env
# Edit with your API keys if needed

# Build and run
docker-compose up -d --build
```

### 3. Set up Nginx + SSL (optional, for custom domain)
```bash
apt install nginx certbot python3-certbot-nginx -y

# Nginx config at /etc/nginx/sites-available/atlas
server {
    server_name atlas-fund.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

ln -s /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
certbot --nginx -d atlas-fund.com
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/gate` | Macro gate status (GO/CAUTION/WARN/STOP) |
| `GET /api/pulse` | Market pulse (S&P, VIX, F&G, Fed, 10Y) |
| `GET /api/scan/{mode}` | Scan universe (stocks/crypto/leveraged) |
| `GET /api/score/{ticker}` | Full score for a single ticker |
| `GET /api/chart/{ticker}` | OHLCV + indicators for charting |
| `GET /api/catalyst/{ticker}` | FMP + OpenInsider catalyst data |
| `GET /api/news` | Macro news with sentiment |
| `GET /api/earnings` | Upcoming earnings this week |
| `GET /api/overview` | Crypto + index prices |
| `GET /api/cache/stats` | Cache diagnostics |
| `POST /api/cache/clear` | Clear all caches |

## Update Process

```bash
# Make changes, push to GitHub
git add . && git commit -m "update" && git push

# On server: pull and rebuild
ssh root@your-server
cd atlas-dashboard
git pull
docker-compose up -d --build
```

## Tech Stack

- **Backend:** Python 3.11, FastAPI, yfinance, pandas, numpy
- **Frontend:** React 18, Vite, Recharts
- **Data:** yfinance, CoinGecko, Finnhub, FRED, FMP, OpenInsider
- **Deploy:** Docker, Nginx, Hetzner CX22

---
*ATLAS v7 · 14-Rule Engine · Not Financial Advice*
