#!/bin/sh
# Encrypted daily backup: database dump and photo archive.
# Settings come from the environment, see .env.example.
set -eu
set -o pipefail
umask 077

dir=/backups
interval_hours="${BACKUP_INTERVAL_HOURS:-24}"
keep_days="${BACKUP_RETENTION_DAYS:-30}"

encrypt() {
  # The passphrase travels on its own file descriptor, so it never shows in the process list.
  gpg --batch --yes --quiet --no-tty --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 --output "$1" 3<<PASS
$BACKUP_PASSPHRASE
PASS
}

run_once() {
  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    echo "BACKUP_PASSPHRASE is not set. Nothing was backed up." >&2
    return 1
  fi
  stamp=$(date +%Y-%m-%d)
  # Written under a temporary name first, so a failed run never leaves a half file that looks complete.
  pg_dump -h db -U greencats -Fc greencats | encrypt "$dir/.db-$stamp.tmp"
  mv "$dir/.db-$stamp.tmp" "$dir/db-$stamp.dump.gpg"
  tar -czf - -C /uploads . | encrypt "$dir/.photos-$stamp.tmp"
  mv "$dir/.photos-$stamp.tmp" "$dir/photos-$stamp.tar.gz.gpg"
  echo "Backup $stamp written."

  # Old backups hold data that has since been erased in the app, so they must not live forever.
  find "$dir" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'db-*.dump.gpg' -o -name 'photos-*.tar.gz' -o -name 'photos-*.tar.gz.gpg' \) \
    -mtime +"$keep_days" -print -delete

  if [ -n "${BACKUP_REMOTE:-}" ]; then
    # gs://bucket/path becomes rclone's :gcs:bucket/path. Any other value is passed to rclone as it is.
    case "$BACKUP_REMOTE" in
      gs://*) remote=":gcs:${BACKUP_REMOTE#gs://}" ;;
      *) remote="$BACKUP_REMOTE" ;;
    esac
    # Only encrypted files leave the server.
    rclone copy "$dir" "$remote" --include 'db-*.dump.gpg' --include 'photos-*.tar.gz.gpg' --max-depth 1
    echo "Copied to $BACKUP_REMOTE."
    # The copies there are kept as long as the ones here, for the same reason.
    rclone delete "$remote" --include 'db-*.dump.gpg' --include 'photos-*.tar.gz.gpg' --max-depth 1 --min-age "${keep_days}d" \
      || echo "Old copies at $BACKUP_REMOTE could not be deleted. The key needs permission to delete, or set a lifecycle rule." >&2
  fi
}

if [ "${1:-}" = "once" ]; then
  run_once
  exit
fi
while true; do
  run_once || echo "Backup failed. Trying again in $interval_hours hours." >&2
  sleep $((interval_hours * 3600))
done
