# Green Cats

Shelter management for Green Cats: animals, medical history, fosters and adopters,
a shared calendar, adoption paperwork, visibility cases and reports. The interface
is in Romanian and English, chosen per user.

This app holds personal data. Never commit the workbook, `.env`, `uploads/`,
`import/` or `backups/`. All of them are ignored by git.

## Deploy on a server

You need a Linux server with Docker and a domain whose DNS record points to it,
with ports 80 and 443 open. HTTPS certificates are issued automatically.

```sh
cp .env.example .env                 # set POSTGRES_PASSWORD and DOMAIN
chmod 600 .env
docker compose up -d --build
```

Create the first administrator. They choose a new password at first login:

```sh
docker compose run --rm tools npm run create-admin -- you@example.org "Your Name" "temporary-password-12+"
```

Import the workbook once. Put it in `import/` first:

```sh
docker compose run --rm tools npm run import -- /import/inventar.xlsx
```

Afterwards, work through the **De verificat** page. It lists everything the import
could not read with confidence, and photos that need assigning to a cat.

Re-importing requires `--replace`, which **erases all shelter data entered in the
app** (accounts are kept).

## Try it on your own computer

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open http://localhost:3111. Set `LOCAL_PORT` in `.env` to use another port. Create
the admin and import as above, adding the same two `-f` options.

## Roles

| | Volunteer | Coordinator | Admin |
|---|---|---|---|
| Edit animals, medical records, calendar | yes | yes | yes |
| See phones, addresses, contact notes | no | yes | yes |
| Edit contacts, resolve review items | no | yes | yes |
| Delete another person's medical record, export a person's data | no | yes | yes |
| Manage users, read the change log, erase a person, delete a cat | no | no | yes |

Two flags can be added to any user. **Adoptions owner** edits adoption cases and
sees contacts. **Visibility owner** edits visibility cases. Admins can do both.

Phone numbers inside free-text notes are hidden from volunteers automatically.
Street addresses typed into notes cannot be detected, so keep them in the
person's address field.

## Reminders

Due dates come from `src/lib/medical-schedule.ts`. The intervals are working
assumptions that the shelter's vet should confirm. A due date can also be set by
hand on any medical record.

## Products and clinics

The **Liste** page (admins and coordinators) holds the products and clinics offered
when adding a medical record. A product can have its own interval until the next
dose; left empty, the general rule in `src/lib/medical-schedule.ts` applies. Kittens
always get the short kitten intervals. Merge two entries when one is a duplicate.

The import links notes such as "Nextgard combo - Energy" to the matching product and
clinic. For data imported before this existed, run once (take a backup first):

```sh
docker compose run --rm tools npm run normalize-medical               # dry run
docker compose run --rm tools npm run normalize-medical -- --apply
```

Once the vet has confirmed product intervals, `-- --apply --recalculate` updates each
cat's next due dates from them. Notes it can't recognise appear on **De verificat**.

## Data protection

Open **Protecția datelor** (admins only) to see whose data is past the retention
period and erase it. Nothing is erased automatically. The period is
`DATA_RETENTION_DAYS` in `.env`, 1825 days (5 years) unless changed. It counts from
a person's last placement or last edit. Change-log entries older than the period
are deleted automatically.

On a person's page an admin can erase their data and a coordinator can download
everything stored about them. Erasing empties the record and keeps the row, so
each cat still shows it was placed. Text typed about the person in other notes has
to be removed by hand.

Volunteers never see phone numbers, e-mail addresses, postal addresses or foster
ratings. Phone numbers and e-mail addresses typed into any text field are hidden
from them. Landline numbers and street addresses in free text are not detected.

Uploaded photos are re-encoded, which removes the location a phone stores in them.

## Backups

The `backup` service writes an encrypted database dump and photo archive once a
day. Set these in `.env` (see `.env.example`):

- `BACKUP_PASSPHRASE`: required. Without it no backup is written. Keep a copy
  somewhere else, because the backups cannot be read without it.
- `BACKUP_DIR`: where the files go on the server, `./backups` unless changed.
- `BACKUP_RETENTION_DAYS`: older files in that folder are deleted, 30 unless changed.
- `BACKUP_REMOTE`: optional copy to cloud storage, for example
  `gs://my-bucket/greencats`. Put the service-account key at `secrets/gcs.json`
  and set a lifecycle rule on the bucket to delete old files.

Run one now with `docker compose run --rm backup once`. To restore:

```sh
gpg -d backups/db-YYYY-MM-DD.dump.gpg | docker compose exec -T db pg_restore -U greencats -d greencats --clean --if-exists
```

Restore photos by decrypting the matching `photos-*.tar.gz.gpg` and extracting it
into the `uploads` volume.

If the database password or the backup passphrase may have leaked, replace both while
the stack is running:

```sh
bash scripts/rotate-secrets.sh
```

It writes new random values to `.env`, changes the database password, re-encrypts the
backups in `backups/` with the new passphrase and restarts the stack. Copies already
uploaded to `BACKUP_REMOTE` keep the old passphrase. Keep a copy of the new one
somewhere else.

## Development

```sh
docker compose -f docker-compose.dev.yml up -d
export DATABASE_URL=postgres://greencats:dev-only-password@127.0.0.1:5433/greencats
npm run db:migrate && npm run dev
npm test          # unit tests
npx playwright test   # browser tests; needs a running stack and E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
```

After changing `src/db/schema.ts`, run `npm run db:generate` and commit the new migration.

## License

MIT, see [LICENSE](LICENSE). The license covers the code only. Shelter data never belongs in this repository.
