#!/bin/sh
# Zaboni nightly backup → Cloudflare R2.
#
#   zaboni-backup daemon   run forever: once at start if the last success is
#                          older than a day, then every night at BACKUP_HOUR
#   zaboni-backup once     one backup now (exit code tells if it worked)
#   zaboni-backup restore-help   print how to restore
#
# Database: pg_dump (custom format), checked with pg_restore --list, encrypted
# with AES-256 (openssl, PBKDF2) and uploaded as db/zaboni-<date>.dump.enc.
# Files: uploaded images are synced through an rclone "crypt" remote, so file
# contents and names are encrypted at rest in R2 too.
# Retention: database dumps older than BACKUP_KEEP_DAYS are deleted.
# Every run writes $STATUS_DIR/last.json, which the API shows on the admin
# dashboard and alerts on (WhatsApp) when backups stop.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required (keep a copy outside the server!)}"
BACKUP_HOUR="${BACKUP_HOUR:-3}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STATUS_DIR="${STATUS_DIR:-/backup-status}"
STORAGE_DIRS="${STORAGE_DIRS:-/data/storage/public /data/storage/private}"
WORK_DIR="${WORK_DIR:-/tmp/zaboni-backup}"

# rclone remotes from the environment (no config file on disk):
#   r2:   Cloudflare R2 (S3 API)
#   r2c:  encrypting wrapper over r2:<bucket>/storage
if [ -z "${RCLONE_CONFIG_R2_TYPE:-}" ]; then
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
  : "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
fi
export RCLONE_CONFIG_R2C_TYPE=crypt
export RCLONE_CONFIG_R2C_REMOTE="r2:${R2_BUCKET}/storage"
RCLONE_CONFIG_R2C_PASSWORD="$(rclone obscure "$BACKUP_PASSPHRASE")"
export RCLONE_CONFIG_R2C_PASSWORD

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

write_status() { # ok|failed, message, db_bytes
  mkdir -p "$STATUS_DIR"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  last_ok="$(sed -n 's/.*"lastSuccessAt": *"\([^"]*\)".*/\1/p' "$STATUS_DIR/last.json" 2>/dev/null || true)"
  [ "$1" = ok ] && last_ok="$now"
  msg="$(printf '%s' "$2" | tr '"\\\n' "'/ " | cut -c1-300)"
  cat > "$STATUS_DIR/last.json.tmp" <<JSON
{"status": "$1", "at": "$now", "lastSuccessAt": "${last_ok}", "message": "$msg", "dbBytes": ${3:-0}, "bucket": "$R2_BUCKET"}
JSON
  mv "$STATUS_DIR/last.json.tmp" "$STATUS_DIR/last.json"
}

run_once() {
  # Every step is checked explicitly: `set -e` does not apply inside a
  # function called from an `if`, which is how attempt() runs this.
  stamp="$(date +%Y-%m-%d_%H%M)"
  rm -rf "$WORK_DIR" && mkdir -p "$WORK_DIR" || return 1
  dump="$WORK_DIR/zaboni-$stamp.dump"

  log "dumping database"
  pg_dump --format=custom --compress=9 --no-owner --no-privileges "$DATABASE_URL" -f "$dump" || { echo "pg_dump failed"; return 1; }
  # Refuse to upload an unreadable or empty dump.
  toc="$(pg_restore --list "$dump")" || { echo "dump is not readable"; return 1; }
  tables="$(printf '%s\n' "$toc" | grep -c ' TABLE DATA ' || true)"
  [ "${tables:-0}" -gt 0 ] || { echo "dump has no table data"; return 1; }

  log "encrypting"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$dump" -out "$dump.enc" || { echo "encryption failed"; return 1; }
  bytes="$(wc -c < "$dump.enc" | tr -d ' ')"

  log "uploading database ($bytes bytes, $tables tables)"
  rclone copyto "$dump.enc" "r2:${R2_BUCKET}/db/zaboni-$stamp.dump.enc" || { echo "upload to R2 failed"; return 1; }

  for dir in $STORAGE_DIRS; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    log "syncing files: $dir"
    rclone sync "$dir" "r2c:$name" --exclude "apk/**" --fast-list || { echo "file sync failed: $dir"; return 1; }
  done

  log "removing database backups older than $BACKUP_KEEP_DAYS days"
  rclone delete "r2:${R2_BUCKET}/db" --min-age "${BACKUP_KEEP_DAYS}d" || log "retention cleanup failed (will retry next run)"

  rm -rf "$WORK_DIR"
  write_status ok "database $tables tables, $bytes bytes" "$bytes"
  log "done"
}

attempt() {
  if out="$(run_once 2>&1)"; then
    printf '%s\n' "$out"
    return 0
  fi
  printf '%s\n' "$out"
  write_status failed "$(printf '%s' "$out" | tail -n 3)" 0
  log "FAILED"
  rm -rf "$WORK_DIR"
  return 1
}

seconds_until_next_run() {
  now_h=$(date +%H | sed 's/^0//'); now_m=$(date +%M | sed 's/^0//'); now_s=$(date +%S | sed 's/^0//')
  elapsed=$(( now_h * 3600 + now_m * 60 + now_s ))
  target=$(( BACKUP_HOUR * 3600 ))
  wait=$(( target - elapsed ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  echo "$wait"
}

last_success_age_hours() {
  last="$(sed -n 's/.*"lastSuccessAt": *"\([^"]*\)".*/\1/p' "$STATUS_DIR/last.json" 2>/dev/null || true)"
  [ -n "$last" ] || { echo 9999; return; }
  then_s="$(date -u -d "$last" +%s 2>/dev/null || echo 0)"
  echo $(( ( $(date -u +%s) - then_s ) / 3600 ))
}

case "${1:-daemon}" in
  once) attempt ;;
  daemon)
    log "started; nightly at ${BACKUP_HOUR}:00 ($(date +%Z)), keeping ${BACKUP_KEEP_DAYS} days in bucket ${R2_BUCKET}"
    if [ "$(last_success_age_hours)" -ge 24 ]; then attempt || true; fi
    while true; do
      sleep "$(seconds_until_next_run)"
      attempt || { log "retrying in 30 minutes"; sleep 1800; attempt || true; }
    done
    ;;
  restore-help)
    cat <<'HELP'
Restore the database from R2 (on the server, inside this container):
  rclone lsf r2:$R2_BUCKET/db/                         # list backups
  rclone copyto r2:$R2_BUCKET/db/<file> /tmp/db.enc
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in /tmp/db.enc -out /tmp/db.dump
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /tmp/db.dump
Restore uploaded files:
  rclone copy r2c:public /data/storage/public
  rclone copy r2c:private /data/storage/private
HELP
    ;;
  *) echo "usage: zaboni-backup [daemon|once|restore-help]" >&2; exit 2 ;;
esac
