# InPilot – DigitalOcean Deployment Guide

## Recommended Droplet Specs

| Tier | Plan | vCPU | RAM | SSD | Cost/mo | Best for |
|------|------|------|-----|-----|---------|---------|
| **Starter** | Basic Regular Intel | 2 | 4 GB | 80 GB | ~$24 | < 50 daily users, MongoDB Atlas |
| **Recommended** | Basic Premium Intel | 2 | 4 GB | 80 GB | ~$28 | Early SaaS, good CPU for builds |
| **Comfortable** | Basic Regular Intel | 4 | 8 GB | 160 GB | ~$48 | 50–200 daily users, local Mongo |
| **Scale** | General Purpose | 4 | 16 GB | 200 GB | ~$96 | 200+ users, no Atlas |

> **Use MongoDB Atlas (free/M10 tier) and the $28 2 vCPU/4 GB droplet.** Hosting Mongo on the droplet wastes RAM the app needs. Upgrade the droplet size when CPU consistently stays above 70 %.

**OS:** Ubuntu 22.04 LTS x64  
**Region:** Choose closest to your users (e.g. NYC3, LON1, SGP1)  
**Additional options:** Enable "Monitoring" (free) and "Backups" ($5/mo)

---

## Architecture Overview

```
Internet
   │
   ▼
Nginx (80/443) ← Certbot SSL
   │
   ▼
Next.js app   :3000  (Docker)
Socket.IO     :3001  (same container, custom server.ts)
   │
   ▼
MongoDB Atlas  (or local Mongo container)
```

---

## Part 1 – One-Time Droplet Setup

### 1.1 Create the Droplet

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com) → **Droplets → Create**
2. Choose **Ubuntu 22.04 LTS**, **Basic Premium Intel 2 vCPU 4 GB** droplet
3. Add your **SSH public key** → create droplet
4. Note the **IP address** (e.g. `143.198.x.x`)

### 1.2 Run the Setup Script

SSH in as root, then run the script:

```bash
ssh root@YOUR_DROPLET_IP

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/Rohail-Suii/InPilot/master/scripts/setup-droplet.sh | bash
```

The script will:
- Update packages & enable auto security updates
- Create a non-root `deploy` user (used by CI/CD)
- Install Docker + Docker Compose plugin
- Configure UFW firewall (only 22/80/443 open)
- Harden SSH (no root login, no password auth)
- Set up fail2ban
- Configure Docker log rotation

### 1.3 DNS

Point your domain to the droplet IP **before** issuing SSL certs:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `143.198.x.x` |
| A | `www` | `143.198.x.x` |

Wait ~5 minutes for DNS to propagate, then verify:
```bash
dig +short yourdomain.com
```

### 1.4 Create the Production Env File

On the droplet, as the `deploy` user:

```bash
sudo su - deploy
mkdir -p /opt/inpilot
nano /opt/inpilot/.env.production
```

Copy the contents of `.env.production.example` from this repo, fill in real values, and save.

```bash
chmod 600 /opt/inpilot/.env.production
```

### 1.5 Issue SSL Certificate (First Time)

```bash
# Run certbot standalone (before Nginx is running)
docker run --rm -p 80:80 certbot/certbot certonly \
  --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --email admin@yourdomain.com \
  --agree-tos \
  --no-eff-email

# Certs are in /etc/letsencrypt – mount into docker volumes
# docker-compose already maps ssl-certs:/etc/letsencrypt
# Copy them into the named volume:
docker volume create winpilot_ssl-certs
docker run --rm \
  -v /etc/letsencrypt:/src:ro \
  -v winpilot_ssl-certs:/dest \
  alpine sh -c "cp -a /src/. /dest/"
```

### 1.6 Copy Project Files Manually (First Deploy Only)

```bash
# On your local machine
scp docker-compose.yml deploy@YOUR_DROPLET_IP:/opt/inpilot/
scp -r nginx/ deploy@YOUR_DROPLET_IP:/opt/inpilot/
scp scripts/deploy.sh deploy@YOUR_DROPLET_IP:/opt/inpilot/scripts/
```

### 1.7 First Deployment

```bash
# On the droplet
cd /opt/inpilot

# Log in to GitHub Container Registry (use a GitHub Personal Access Token)

# Deploy
bash scripts/deploy.sh
```

---

## Part 2 – CI/CD Pipeline Setup (GitHub Actions)

The pipeline is in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

### 2.1 Generate Deploy SSH Key

On the **droplet**, as the `deploy` user:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Print the private key – you'll paste this into GitHub secrets
cat ~/.ssh/github_deploy
```

### 2.2 Add GitHub Actions Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|-------|
| `DROPLET_IP` | Your droplet IP, e.g. `143.198.12.34` |
| `DROPLET_SSH_KEY` | Content of `~/.ssh/github_deploy` (private key) |
| `DOMAIN` | Your domain, e.g. `inpilot.io` |

> `GITHUB_TOKEN` is automatically provided by GitHub Actions — no need to add it manually.

### 2.3 Enable github.com Package Registry for the Image

Go to your repo → **Packages** (right sidebar) → click the package → **Package settings → Change visibility → Public**

Or if you keep it private, make sure the `deploy` user on the droplet is logged in to `ghcr.io`.

### 2.4 Create a GitHub Environment (Optional but Recommended)

In your repo → **Settings → Environments → New environment → `production`**

Add a "Required reviewers" if you want manual approval before each deploy.

---

## Part 3 – How Deployments Work

```
git push origin master
        │
        ▼
GitHub Actions:
  ┌─────────────────────────────────┐
  │  Job 1: Lint + TypeCheck + Tests │  ◄ PR and push
  └──────────────┬──────────────────┘
                 │ (only master push proceeds)
  ┌──────────────▼──────────────────┐
  │  Job 2: Build Docker image       │
  │  → push to ghcr.io/:latest       │
  └──────────────┬──────────────────┘
                 │
  ┌──────────────▼──────────────────┐
  │  Job 3: SSH into droplet         │
  │  → docker pull latest            │
  │  → docker compose up app         │
  │  → health check (120s)           │
  │  → docker image prune            │
  └─────────────────────────────────┘
```

**Zero-downtime**: Only the `app` container is restarted. Nginx and MongoDB stay running throughout.

---

## Part 4 – nginx.conf WebSocket Proxy Update

The existing `nginx/nginx.conf` needs a WebSocket upstream for Socket.IO. Make sure it contains:

```nginx
# Upstream for WebSocket (Socket.IO)
upstream websocket_app {
    server app:3001;
    keepalive 8;
}

# In your server block – Socket.IO path
location /socket.io/ {
    proxy_pass         http://websocket_app;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 86400;
}
```

---

## Part 5 – Day-to-Day Operations

### View Logs
```bash
ssh deploy@YOUR_DROPLET_IP
cd /opt/inpilot
docker compose logs -f app        # live app logs
docker compose logs --tail=100 nginx
```

### Restart a Service
```bash
docker compose restart app
docker compose restart nginx
```

### Manual Deploy (hotfix without pushing)
```bash
SKIP_PULL=1 bash /opt/inpilot/scripts/deploy.sh
```

### SSL Renewal (handled automatically by certbot service)
```bash
# Force manual renewal
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d yourdomain.com -d www.yourdomain.com
docker compose exec nginx nginx -s reload
```

### Database Backup (if using local Mongo)
```bash
docker exec linkedboost-mongo \
  mongodump --out /dump --db inpilot

docker cp linkedboost-mongo:/dump ./backup-$(date +%Y%m%d)
```

### Check Disk Space
```bash
df -h
docker system df
```

---

## Part 6 – Scaling Checklist

When you outgrow the starter droplet:

- [ ] Move MongoDB to **Atlas M10** ($57/mo) — biggest single win for app performance
- [ ] Upgrade droplet to **4 vCPU / 8 GB** when sustained CPU > 70 %
- [ ] Add a **DigitalOcean Managed Redis** ($15/mo) for session caching / rate limiting
- [ ] Enable **DigitalOcean Load Balancer** + second droplet for HA (~$12/mo + second droplet)
- [ ] Add **DigitalOcean Spaces** (S3-compatible) for PDF/resume file storage

---

## Quick Reference

```bash
# SSH in
ssh deploy@YOUR_DROPLET_IP

# All services status
cd /opt/inpilot && docker compose ps

# App health
curl -s https://yourdomain.com/api/health | jq

# Resource usage
docker stats --no-stream
htop
```
