# Google Drive ingest — service account setup

One-time setup so the daily `drive-ingest` job (`scripts/drive-sync.mjs`) can read the shared
Drive folders. We use a **service account** (a robot Google identity) rather than personal OAuth,
because service-account credentials don't expire and don't need a consent screen — ideal for CI.

Access is granted the same way you'd share with a person: the folder owner **shares the folders
with the service account's email address**. No IAM roles, no domain-wide delegation, no billing.

---

## 1. Create (or pick) a Google Cloud project

1. Go to <https://console.cloud.google.com>.
2. Top bar → project dropdown → **New Project** (e.g. name it `ybt-shiurim`). Create it and make
   sure it's selected in the dropdown.

## 2. Enable the Google Drive API

1. Go to <https://console.cloud.google.com/apis/library/drive.googleapis.com> (make sure the right
   project is selected).
2. Click **Enable**.

*(No "OAuth consent screen" configuration is needed — that's only for user-based OAuth, not service
accounts.)*

## 3. Create the service account

1. **APIs & Services → Credentials** (or **IAM & Admin → Service Accounts**) → **Create credentials
   → Service account**.
2. Name it e.g. `drive-ingest`. The auto-generated email will look like
   `drive-ingest@ybt-shiurim.iam.gserviceaccount.com` — **copy this email**, you need it in step 5.
3. Skip "Grant this service account access to project" (leave roles empty — Drive access comes from
   folder sharing, not IAM) and skip "grant users access". Click **Done**.

## 4. Create a JSON key

1. Click the new service account → **Keys** tab → **Add key → Create new key**.
2. Choose **JSON** → **Create**. A `.json` file downloads. **Keep it secret** — it's a credential.

## 5. Share the Drive folders with the service account

The recordings live in folders owned by **Tamar Lichtenstein**, so she (the owner) must do the
sharing — a viewer can't re-share.

1. Send Tamar the service-account email from step 3.
2. Ask her to open each root folder in Drive → **Share** → paste that email → role **Viewer** →
   send. Do this for **both** roots (and any future ones):
   - `Rabbi Bald - Gemara`
   - `Masoret rotating Sunday…`
3. The service account now sees exactly those folders (and their subfolders) — nothing else.

> The root folder IDs are already in `data/drive-folders.json`. When new rabbi folders/roots are
> added, share them with the same service-account email and add their IDs there.

## 6. Provide the credential to the app

The worker accepts the key as **raw JSON or base64**. Base64 is easiest because it's a single line
(no worrying about the newlines inside `private_key`). Encode the downloaded file:

- **macOS/Linux:** `base64 -w0 drive-ingest-key.json` (on macOS: `base64 -i drive-ingest-key.json`)
- **Windows PowerShell:** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("drive-ingest-key.json"))`

**GitHub Actions (for the daily job):**
Repo → **Settings → Secrets and variables → Actions → New repository secret**
→ name `GOOGLE_SERVICE_ACCOUNT_JSON`, value = the base64 string (or paste the raw JSON — multiline
is fine in the secret box).

**Local (for the backfill / testing):** add one line to `shiurim-app/.env.local`:

```
GOOGLE_SERVICE_ACCOUNT_JSON=<the base64 string>
```

## 7. Create the dedup table

In the Supabase SQL editor, run the `drive_ingest_log` block from `supabase-schema.sql`.

## 8. Test

From `shiurim-app/`:

```bash
# Lists the folders and prints how every filename parses — no downloads, no writes.
node scripts/drive-sync.mjs --dry-run

# Real ingest of a single file end-to-end (R2 upload + pending_lectures + deploy).
node scripts/drive-sync.mjs --max 1
```

If `--dry-run` lists files and prints `date | speaker | "title"` lines, auth and sharing are
working. Then run the full backfill: `node scripts/drive-sync.mjs` (optionally `--max N` in batches).
After that, `.github/workflows/drive-ingest.yml` picks up new recordings daily.

### Troubleshooting

- **`GOOGLE_SERVICE_ACCOUNT_JSON is not set`** — the env var isn't loaded; check `.env.local` (local)
  or the GitHub secret (CI).
- **Lists 0 files** — the folders haven't been shared with the service-account email yet (step 5),
  or the IDs in `data/drive-folders.json` are wrong.
- **`invalid_grant` / auth errors** — the key JSON is malformed (bad copy/paste); re-encode the file.
- **`403 … Drive API has not been used/enabled`** — enable the Drive API in the correct project
  (step 2).
