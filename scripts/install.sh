#!/usr/bin/env bash
set -euo pipefail

SUDO=""
if [[ "$(id -u)" != "0" ]]; then
  SUDO="sudo"
fi

INSTALL_DIR="/opt/vcs-tools/container-guard"
REPO_URL="git@github.com:00peter0/vcs-container-guard.git"
DB_NAME="container_guard"
DB_USER="vcs-admin"
DB_PASS='VcsAdmin2024!'
DB_HOST="127.0.0.1"
DB_PORT="5432"
API_PORT="3847"
UI_PORT="4000"
API_SERVICE="vcs-container-guard"
UI_SERVICE="vcs-container-guard-ui"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --db-url)  DB_URL="$2"; shift 2 ;;
    --update)  UPDATE_MODE=1; shift ;;
    *) die "Neznámy parameter: $1" ;;
  esac
done

DB_URL="${DB_URL:-postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}}"
UPDATE_MODE="${UPDATE_MODE:-0}"

info "Kontrolujem závislosti..."
command -v node    >/dev/null 2>&1 || die "Node.js nie je nainštalovaný"
command -v npm     >/dev/null 2>&1 || die "npm nie je nainštalovaný"
command -v psql    >/dev/null 2>&1 || die "psql nie je nainštalovaný"
command -v git     >/dev/null 2>&1 || die "git nie je nainštalovaný"
command -v openssl >/dev/null 2>&1 || die "openssl nie je nainštalovaný"
success "Závislosti OK"

info "Zastavujem existujúce services..."
${SUDO} systemctl stop "${API_SERVICE}" 2>/dev/null || true
${SUDO} systemctl stop "${UI_SERVICE}"  2>/dev/null || true
${SUDO} fuser -k "${API_PORT}/tcp" 2>/dev/null || true
${SUDO} fuser -k "${UI_PORT}/tcp"  2>/dev/null || true
sleep 1

if [[ "${UPDATE_MODE}" == "1" && -d "${INSTALL_DIR}/.git" ]]; then
  info "Update mode — pull..."
  cd "${INSTALL_DIR}" && git pull origin main
else
  info "Klonovanie do ${INSTALL_DIR}..."
  ${SUDO} rm -rf "${INSTALL_DIR}"
  ${SUDO} mkdir -p "$(dirname "${INSTALL_DIR}")"
  ${SUDO} git clone "${REPO_URL}" "${INSTALL_DIR}"
  ${SUDO} chown -R "$(id -u):$(id -g)" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"
success "Repozitár: $(git log --oneline -1)"

info "Build API..."
npm install
npm run build 2>/dev/null || npx tsc
success "API build hotový"

info "Build UI..."
npm ci --prefix ui 2>/dev/null || npm install --prefix ui
npm run build --prefix ui
success "UI build hotový"

info "Statické súbory UI..."
UI_STANDALONE="${INSTALL_DIR}/ui/.next/standalone"
cp -r "${INSTALL_DIR}/ui/.next/static" "${UI_STANDALONE}/.next/static"
cp -r "${INSTALL_DIR}/ui/public" "${UI_STANDALONE}/public" 2>/dev/null || true

info "PostgreSQL migrácia..."
PGPASSWORD="${DB_PASS}" psql -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" -d postgres \
  -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || {
  PGPASSWORD="${DB_PASS}" createdb -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" "${DB_NAME}"
  success "DB vytvorená"
}
PGPASSWORD="${DB_PASS}" psql -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" -d "${DB_NAME}" \
  -f "${INSTALL_DIR}/migrations/001_init.sql" -q
success "Migrácia OK"

API_KEY="$(openssl rand -hex 32)"

${SUDO} tee "${INSTALL_DIR}/config.json" > /dev/null << EOF
{
  "dbUrl": "${DB_URL}",
  "apiPort": ${API_PORT},
  "scanIntervalMs": 300000,
  "alertQueueInterval": 120000
}
EOF

info "Vytváram systemd services..."
${SUDO} tee "/etc/systemd/system/${API_SERVICE}.service" > /dev/null << EOF
[Unit]
Description=VCS Container Guard API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node dist/api.js
Restart=always
RestartSec=5
Environment=CG_API_KEY=${API_KEY}
Environment=NODE_ENV=production
Environment=CONFIG_PATH=${INSTALL_DIR}/config.json

[Install]
WantedBy=multi-user.target
EOF

${SUDO} tee "/etc/systemd/system/${UI_SERVICE}.service" > /dev/null << EOF
[Unit]
Description=VCS Container Guard UI
After=network.target ${API_SERVICE}.service

[Service]
Type=simple
User=root
WorkingDirectory=${UI_STANDALONE}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=${UI_PORT}
Environment=HOSTNAME=127.0.0.1
Environment=GUARD_API_URL=http://127.0.0.1:${API_PORT}
Environment=CG_API_KEY=${API_KEY}
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

info "Nastavujem cron job pre scanner..."
DB_URL_CRON="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
(crontab -l 2>/dev/null | grep -v container-guard; \
  printf '*/5 * * * * DATABASE_URL=%s /usr/bin/node %s/dist/scanner-cron.js >> /var/log/container-guard-scan.log 2>&1\n' \
  "${DB_URL_CRON}" "${INSTALL_DIR}") | crontab -
success "Cron nastavený"

info "Spúšťam services..."
${SUDO} systemctl daemon-reload
${SUDO} systemctl enable "${API_SERVICE}" "${UI_SERVICE}"
${SUDO} systemctl start "${API_SERVICE}"
sleep 2
${SUDO} systemctl start "${UI_SERVICE}"
sleep 3

info "Overujem..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-api-key: ${API_KEY}" "http://127.0.0.1:${API_PORT}/api/stats")
UI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:${UI_PORT}/guard")

[[ "${API_STATUS}" == "200" ]] || die "API nereaguje (HTTP ${API_STATUS})"
[[ "${UI_STATUS}" =~ ^(200|308)$ ]] || die "UI nereaguje (HTTP ${UI_STATUS})"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Container Guard — Inštalácia úspešná! ✓   ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Dashboard: https://YOUR_DOMAIN/guard        ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
