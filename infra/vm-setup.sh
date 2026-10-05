#!/usr/bin/env bash
# One-time bootstrap for an Oracle Cloud Always Free Ampere (arm64) Ubuntu VM.
#
# Usage (on the VM):
#   export DUCKDNS_SUBDOMAIN=yourapp DUCKDNS_TOKEN=xxxxxxxx
#   export REPO_URL=https://github.com/pranshu1606/mPHATEKApp1.git
#   curl -fsSL https://raw.githubusercontent.com/pranshu1606/mPHATEKApp1/main/infra/vm-setup.sh | bash
#   # or: bash infra/vm-setup.sh   (from a checkout)
set -euo pipefail

: "${DUCKDNS_SUBDOMAIN:?export DUCKDNS_SUBDOMAIN (the part before .duckdns.org)}"
: "${DUCKDNS_TOKEN:?export DUCKDNS_TOKEN}"
REPO_URL="${REPO_URL:-https://github.com/pranshu1606/mPHATEKApp1.git}"
APP_DIR="${APP_DIR:-$HOME/app}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "Installing base packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git iptables-persistent

log "Installing Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

log "Opening ports 80/443 in the host firewall"
# Oracle's Ubuntu images ship iptables rules that REJECT everything except SSH.
# (You must ALSO add ingress rules for 80/443 in the VCN security list.)
for port in 80 443; do
  sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT -p udp --dport 443 -j ACCEPT   # HTTP/3 to Caddy
sudo netfilter-persistent save

log "Configuring DuckDNS updater (every 5 minutes)"
mkdir -p "$HOME/duckdns"
cat > "$HOME/duckdns/duck.sh" <<EOF
#!/usr/bin/env bash
curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o "$HOME/duckdns/duck.log"
EOF
chmod 700 "$HOME/duckdns/duck.sh"
"$HOME/duckdns/duck.sh"
echo "DuckDNS response: $(cat "$HOME/duckdns/duck.log")"

log "Cloning the repository into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

log "Installing cron jobs (DuckDNS + nightly backup)"
CRON_TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v -e 'duckdns/duck.sh' -e 'infra/backup.sh' > "$CRON_TMP" || true
echo "*/5 * * * * $HOME/duckdns/duck.sh >/dev/null 2>&1" >> "$CRON_TMP"
echo "30 3 * * * cd $APP_DIR && bash infra/backup.sh >> $HOME/backup.log 2>&1" >> "$CRON_TMP"
crontab "$CRON_TMP"
rm -f "$CRON_TMP"

cat <<EOF

Done. Next steps:
  1. Log out and back in (so your user can run docker without sudo).
  2. cd $APP_DIR && cp .env.example .env && nano .env
       - set ORIGIN_HOST=${DUCKDNS_SUBDOMAIN}.duckdns.org, ORIGIN_VERIFY_SECRET, ACME_EMAIL
       - PUBLIC_URL comes from 'terraform output public_url' (fill in after step 3 of DEPLOYMENT.md)
  3. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
EOF
