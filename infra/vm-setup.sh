#!/usr/bin/env bash
# One-time bootstrap for the Ubuntu (arm64) origin VM.
# On AWS this runs automatically on first boot via Terraform user data.
#
# Manual usage:
#   export DUCKDNS_SUBDOMAIN=yourapp DUCKDNS_TOKEN=xxxxxxxx
#   bash infra/vm-setup.sh
set -euo pipefail

: "${DUCKDNS_SUBDOMAIN:?export DUCKDNS_SUBDOMAIN (the part before .duckdns.org)}"
: "${DUCKDNS_TOKEN:?export DUCKDNS_TOKEN}"
REPO_URL="${REPO_URL:-https://github.com/pranshu1606/mPHATEKApp1.git}"
REPO_REF="${REPO_REF:-main}"
APP_DIR="${APP_DIR:-$HOME/app}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "Installing base packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git

log "Adding ${SWAP_SIZE} swap (small instances need headroom for the ML stack)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l "$SWAP_SIZE" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

log "Installing Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

# Oracle Cloud's Ubuntu images REJECT everything but SSH in iptables; AWS images
# don't (the security group is the firewall there), so only touch it when needed.
if sudo iptables -S INPUT | grep -q -- '-j REJECT'; then
  log "Opening ports 80/443 in the host firewall"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  done
  sudo netfilter-persistent save
fi

log "Configuring DuckDNS updater (every 5 minutes)"
mkdir -p "$HOME/duckdns"
cat > "$HOME/duckdns/duck.sh" <<EOF
#!/usr/bin/env bash
curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o "$HOME/duckdns/duck.log"
EOF
chmod 700 "$HOME/duckdns/duck.sh"
"$HOME/duckdns/duck.sh"
echo "DuckDNS response: $(cat "$HOME/duckdns/duck.log")"

log "Checking out the repository in $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone -b "$REPO_REF" "$REPO_URL" "$APP_DIR"
fi

log "Installing cron jobs (DuckDNS + nightly backup)"
CRON_TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v -e 'duckdns/duck.sh' -e 'infra/backup.sh' > "$CRON_TMP" || true
echo "*/5 * * * * $HOME/duckdns/duck.sh >/dev/null 2>&1" >> "$CRON_TMP"
echo "30 3 * * * cd $APP_DIR && bash infra/backup.sh >> $HOME/backup.log 2>&1" >> "$CRON_TMP"
crontab "$CRON_TMP"
rm -f "$CRON_TMP"

cat <<EOF

Bootstrap complete. Next (see DEPLOYMENT.md):
  1. cd $APP_DIR && cp .env.example .env && nano .env
  2. bash infra/deploy.sh          # pulls the CI-built images and starts the stack
EOF
