#!/bin/sh
# Starts as root only to give the backup folder and the storage key to the postgres user,
# then runs the backups as that user.
set -eu
if [ "$(id -u)" = 0 ]; then
  chown -R postgres:postgres /backups
  if [ -f /run/secrets/gcs.json ]; then
    install -m 600 -o postgres -g postgres /run/secrets/gcs.json /tmp/gcs.json
    export RCLONE_GCS_SERVICE_ACCOUNT_FILE=/tmp/gcs.json
  fi
  exec gosu postgres "$0" "$@"
fi
exec /usr/local/bin/backup.sh "$@"
