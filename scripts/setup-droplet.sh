#!/usr/bin/env bash
# =============================================================================
# InPilot – DigitalOcean Droplet Initial Setup Script
# Run this ONCE on a fresh Ubuntu 22.04 LTS droplet as root:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/scripts/setup-droplet.sh | bash
# =============================================================================
set -euo pipefail

APP_DIR="/opt/inpilot"
DEPLOY_USER="deploy"
DOMAIN="${DOMAIN:-yourdomain.com}"   # Override: DOMAIN=inpilot.io bash setup-droplet.sh

echo "============================================"
echo " InPilot Droplet Setup – Ubuntu 22.04"
echo "============================================"

# ── 1. System update ─────────────────────────────────────────────────────────
echo "[1/9] Updating system packages…"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl \
  wget \
  git \
  ufw \
  fail2ban \
  unattended-upgrades \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release \
  htop \
  jq \
  python3

# ── 2. Create non-root deploy user ───────────────────────────────────────────
echo "[2/9] Creating deploy user…"
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  # Allow deploy to run docker commands without sudo
  usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true
fi

# Set up SSH for deploy user (copy root's authorized_keys)
mkdir -p /home/$DEPLOY_USER/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/authorized_keys
fi
chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys 2>/dev/null || true
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

# Allow passwordless sudo for docker compose (CI deployments)
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/local/bin/docker-compose, /usr/bin/docker compose" \
  > /etc/sudoers.d/deploy-docker
chmod 440 /etc/sudoers.d/deploy-docker

# ── 3. Install Docker ─────────────────────────────────────────────────────────
echo "[3/9] Installing Docker…"
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
fi

systemctl enable docker
systemctl start docker

# Add deploy user to docker group
usermod -aG docker $DEPLOY_USER

# ── 4. Configure UFW firewall ────────────────────────────────────────────────
echo "[4/9] Configuring firewall…"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment "SSH"
ufw allow 80/tcp    comment "HTTP"
ufw allow 443/tcp   comment "HTTPS"
# Block direct access to app ports from outside (Nginx is the only entry point)
ufw deny 3000/tcp
ufw deny 3001/tcp
ufw deny 27017/tcp
ufw --force enable

# ── 5. Harden SSH ────────────────────────────────────────────────────────────
echo "[5/9] Hardening SSH…"
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# ── 6. Configure fail2ban ────────────────────────────────────────────────────
echo "[6/9] Configuring fail2ban…"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
systemctl enable fail2ban
systemctl restart fail2ban

# ── 7. Create app directory & set permissions ────────────────────────────────
echo "[7/9] Creating app directory at $APP_DIR…"
mkdir -p "$APP_DIR/nginx"
chown -R $DEPLOY_USER:$DEPLOY_USER "$APP_DIR"

# ── 8. Configure Docker log rotation ─────────────────────────────────────────
echo "[8/9] Configuring Docker log rotation…"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
EOF
systemctl restart docker

# ── 9. Enable automatic security updates ─────────────────────────────────────
echo "[9/9] Enabling unattended security upgrades…"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " Setup complete!"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo "  1. Copy your .env.production file to $APP_DIR/.env.production"
echo "  2. Copy docker-compose.yml and nginx/ to $APP_DIR/"
echo "  3. Issue SSL certificate:"
echo "       docker run --rm -p 80:80 certbot/certbot certonly \\"
echo "         --standalone -d $DOMAIN -d www.$DOMAIN \\"
echo "         --email admin@$DOMAIN --agree-tos --no-eff-email"
echo "  4. Run: cd $APP_DIR && docker compose up -d"
echo ""
echo "  Add these GitHub Actions secrets:"
echo "    DROPLET_IP     = $(curl -s ifconfig.me)"
echo "    DROPLET_SSH_KEY = <contents of deploy user private key>"
echo "    DOMAIN         = $DOMAIN"
echo ""
