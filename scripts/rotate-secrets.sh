#!/usr/bin/env bash
# Replaces POSTGRES_PASSWORD and BACKUP_PASSPHRASE in .env with new random values,
# changes the database password to match, re-encrypts the existing .gpg backups with
# the new passphrase and restarts the stack. Prints no secret. Run it while the stack is up:
#
#   bash scripts/rotate-secrets.sh [another checkout whose stack gets the same values]
#
# It uses the same Compose files the running stack was started with, so it works the
# same on a server and with docker-compose.local.yml on your own computer.
set -euo pipefail
cd "$(dirname "$0")/.."

# The Compose files and project of the stack whose database runs from directory $1.
compose_in() {
  local dir; dir=$(cd "$1" && pwd)
  local id; id=$(docker ps -q --filter "label=com.docker.compose.service=db" --filter "label=com.docker.compose.project.working_dir=$dir" | head -1)
  [ -n "$id" ] || { echo "No running database for $dir. Start the stack first." >&2; exit 1; }
  local project files args=()
  project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
  files=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$id")
  IFS=, read -ra list <<< "$files"
  for f in "${list[@]}"; do args+=(-f "$f"); done
  echo "-p $project --project-directory $dir ${args[*]}"
}

main=$(compose_in .)
old_bk=$(grep '^BACKUP_PASSPHRASE=' .env | cut -d= -f2-)
new_bk=$(openssl rand -base64 48 | tr -d '\n')
new_pg=$(openssl rand -hex 24)

echo "1/4 Re-encrypting backups with the new passphrase"
# shellcheck disable=SC2086
docker compose $main run --rm -T -e OLD_BK="$old_bk" -e NEW_BK="$new_bk" --entrypoint sh backup -c '
  set -eu
  umask 077
  # Its own key directory: two gpg runs racing to create the default one fail.
  export GNUPGHOME=$(mktemp -d)
  printf %s "$OLD_BK" > /tmp/old; printf %s "$NEW_BK" > /tmp/new
  gpg_() { gpg --batch --yes --quiet --no-tty --pinentry-mode loopback "$@"; }
  for f in /backups/*.gpg; do
    [ -e "$f" ] || continue
    # One step at a time, through a file that stays inside this throwaway container.
    gpg_ --passphrase-file /tmp/old --output /tmp/plain --decrypt "$f"
    gpg_ --passphrase-file /tmp/new --symmetric --cipher-algo AES256 --output "$f.new" /tmp/plain
    rm /tmp/plain
    # Only replace the file once the new copy opens with the new passphrase.
    gpg_ --passphrase-file /tmp/new --decrypt "$f.new" > /dev/null
    mv "$f.new" "$f"
    echo "  $(basename "$f")"
  done'

# $1 = Compose arguments, $2 = .env file. Changes the password, writes .env, restarts and checks.
rotate() {
  # shellcheck disable=SC2086
  printf "ALTER USER greencats PASSWORD '%s';\n" "$new_pg" \
    | docker compose $1 exec -T db psql -q -U greencats -d greencats -v ON_ERROR_STOP=1 > /dev/null
  NEW_PG="$new_pg" NEW_BK="$new_bk" perl -i -pe \
    's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$ENV{NEW_PG}/; s/^BACKUP_PASSPHRASE=.*/BACKUP_PASSPHRASE=$ENV{NEW_BK}/' "$2"
  # shellcheck disable=SC2086
  docker compose $1 up -d --wait > /dev/null 2>&1
  # shellcheck disable=SC2086
  docker compose $1 run --rm -T tools npx tsx -e \
    '(async () => { const { pg } = await import("./src/db"); await pg`select 1`; await pg.end(); })()' > /dev/null 2>&1 \
    && echo "  the app reaches the database with the new password" \
    || { echo "  the app could not reach the database: check $2" >&2; exit 1; }
}

echo "2/4 Changing the database password and .env, restarting"
rotate "$main" .env

if [ "${1:-}" ]; then
  echo "3/4 Same values for $1"
  rotate "$(compose_in "$1")" "$1/.env"
else
  echo "3/4 No second checkout given"
fi
unset old_bk new_bk new_pg
echo "4/4 Done. Keep a copy of the new BACKUP_PASSPHRASE outside the server: the .gpg backups now need it."
