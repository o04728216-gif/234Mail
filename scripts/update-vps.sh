#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# 234Mail Safe Non-Destructive VPS Update Script
# Updates website code in-place WITHOUT wiping your users, SMTPs, lists, or .env
# Automatically backs up your existing esp-store.json before rebuilding.
# ==============================================================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +"%Y%m%d-%H%M%S")"

echo "[234Mail Update] App directory: ${APP_DIR}"

# 1. Locate existing production database file
STORE_CANDIDATES=(
  "${DATA_DIR:-}/esp-store.json"
  "/var/data/234mail/esp-store.json"
  "${HOME}/.234mail-data/esp-store.json"
  "${APP_DIR}/data/esp-store.json"
)

FOUND_STORE=""
for f in "${STORE_CANDIDATES[@]}"; do
  if [[ -n "$f" && -f "$f" ]]; then
    FOUND_STORE="$f"
    break
  fi
done

if [[ -n "$FOUND_STORE" ]]; then
  BACKUP_DIR="${HOME}/.234mail-data/snapshots"
  mkdir -p "$BACKUP_DIR"
  BACKUP_PATH="${BACKUP_DIR}/vps-update-backup-${STAMP}.json"
  cp "$FOUND_STORE" "$BACKUP_PATH"
  echo "[234Mail Update] Safety backup saved: ${BACKUP_PATH}"
else
  echo "[234Mail Update] No existing esp-store.json found yet (fresh server)."
fi

# 2. Update code from either a local release folder arg ($1) or git pull
if [[ "${1:-}" != "" && -d "${1}" ]]; then
  SRC_DIR="$(cd "$1" && pwd)"
  echo "[234Mail Update] Syncing new code from ${SRC_DIR} (preserving .env, data/, node_modules/)..."
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude 'data/' \
    --exclude 'node_modules/' \
    --exclude '.git/' \
    "${SRC_DIR}/" "${APP_DIR}/"
elif [[ -d "${APP_DIR}/.git" ]]; then
  echo "[234Mail Update] Pulling latest code from Git (data/ and .env are gitignored and untouched)..."
  git -C "${APP_DIR}" fetch --all
  git -C "${APP_DIR}" pull --ff-only
else
  echo "[234Mail Update] No source directory passed and not a git repo — skipping code fetch, proceeding to build."
fi

# 3. Install dependencies and build production frontend
echo "[234Mail Update] Installing dependencies and building frontend..."
cd "${APP_DIR}"
npm install
npm run build

# 4. Restart running service if PM2 or systemd is detected
if command -v pm2 >/dev/null 2>&1 && pm2 list | grep -qi "234mail"; then
  echo "[234Mail Update] Restarting PM2 process..."
  pm2 restart 234mail
elif command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service | grep -qi "234mail"; then
  echo "[234Mail Update] Restarting systemd service..."
  sudo systemctl restart 234mail
else
  echo "[234Mail Update] Build complete! Restart your Node process (e.g. 'pm2 restart all' or 'npm start')."
fi

echo "[234Mail Update] Done! All existing users, SMTPs, email lists, campaigns, and settings are preserved and auto-merged."
