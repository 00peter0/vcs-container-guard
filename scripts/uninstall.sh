#!/usr/bin/env bash
set -euo pipefail

SUDO=""
if [[ "$(id -u)" != "0" ]]; then
  SUDO="sudo"
fi

INSTALL_DIR="/opt/vcs-tools/container-guard"
API_SERVICE="vcs-container-guard"
UI_SERVICE="vcs-container-guard-ui"
DB_NAME="container_guard"
DB_USER="vcs-admin"
DB_PASS="VcsAdmin2024!"
DB_HOST="127.0.0.1"
DB_PORT="5432"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }

info "Zastavujem services..."
${SUDO} systemctl stop "${API_SERVICE}" 2>/dev/null || true
${SUDO} systemctl stop "${UI_SERVICE}" 2>/dev/null || true
${SUDO} systemctl disable "${API_SERVICE}" 2>/dev/null || true
${SUDO} systemctl disable "${UI_SERVICE}" 2>/dev/null || true

info "Mažem systemd services..."
${SUDO} rm -f "/etc/systemd/system/${API_SERVICE}.service"
${SUDO} rm -f "/etc/systemd/system/${UI_SERVICE}.service"
${SUDO} rm -f "/etc/systemd/system/container-guard-api.service"
${SUDO} rm -f "/etc/systemd/system/container-guard-ui.service"
${SUDO} systemctl daemon-reload

info "Mažem cron job..."
crontab -l 2>/dev/null | grep -v container-guard | crontab - 2>/dev/null || true

info "Mažem inštalačný adresár..."
${SUDO} rm -rf "${INSTALL_DIR}"

info "Mažem logy..."
${SUDO} rm -f /var/log/container-guard-scan.log
${SUDO} rm -f /root/.container-guard-credentials

info "Mažem DB..."
PGPASSWORD="${DB_PASS}" psql -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}';" \
  2>/dev/null || true
PGPASSWORD="${DB_PASS}" psql -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || \
  ${SUDO} -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}';" && \
  ${SUDO} -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};"

success "Container Guard odinštalovaný"
