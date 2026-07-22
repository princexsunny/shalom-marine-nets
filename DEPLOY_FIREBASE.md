# Deploying to Firebase (Hosting + Cloud Run)

Your site is an Express server, so Firebase Hosting alone can't run it. This setup
puts the Node app on **Cloud Run** and points **Firebase Hosting** at it, so visitors
see your own domain while Firestore stores the data and Firebase Storage holds images.

**Before you start, know two things:**

1. This needs the **Blaze (pay-as-you-go)** plan — a credit card on file. Small
   shops normally stay inside the free monthly allowance, but there is no hard cap
   unless you set a budget alert (step 8).
2. Cloud Run instances have an **empty disk on every cold start**. Firestore is
   therefore not optional here — it *is* your database. Never run this without it.

---

## 1. Install the tools

```bash
npm install -g firebase-tools
```

Install the Google Cloud CLI: https://cloud.google.com/sdk/docs/install

```bash
gcloud --version
firebase --version
```

## 2. Create the project and switch to Blaze

1. https://console.firebase.google.com → **Add project** (e.g. `shalom-marine-nets`)
2. Bottom-left, change the plan to **Blaze**
3. **Build → Firestore Database → Create database** → *Production mode* → region
   **asia-south1 (Mumbai)** — closest to Kerala, lowest latency
4. **Build → Storage → Get started** (same region)

> Pick the region once and keep it. Firestore's region can't be changed later.

## 3. Get your service-account key

**Project settings (gear) → Service accounts → Generate new private key.**

Save it as `serviceAccountKey.json` in the project folder. It's already in
`.gitignore` and `.dockerignore` — **never commit it or bake it into the image.**

## 4. Sign in and select the project

```bash
firebase login
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
firebase use YOUR_PROJECT_ID
```

## 5. Push your existing data to the cloud — do this first

Your live data is currently in `data/app.json`. Upload it *before* deploying,
otherwise the first Cloud Run instance starts blank.

```bash
# with serviceAccountKey.json present locally
node -e "const {store}=require('./db');store.startCloudMirror();setTimeout(()=>{console.log('uploaded');process.exit(0)},4000)"
```

Check **Firestore → app → state** in the console. You should see a `json` field.

## 6. Deploy the server to Cloud Run

```bash
gcloud run deploy shalom-marine-nets \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 0 \
  --memory 512Mi \
  --set-env-vars "NODE_ENV=production,FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com,SESSION_SECRET=PASTE_A_LONG_RANDOM_STRING" \
  --set-secrets "FIREBASE_SERVICE_ACCOUNT=firebase-sa:latest"
```

To create that secret first:

```bash
gcloud secrets create firebase-sa --data-file=serviceAccountKey.json
```

### `--max-instances 1` is not optional

Each instance keeps its own copy of the data in memory and on its own disk. Two
instances would each hold a different version of your inventory and overwrite one
another in Firestore. **Keep this at 1.** It comfortably handles a B2B catalogue
site; it is not a limit you'll feel.

## 7. Point Hosting at Cloud Run

`firebase.json` is already configured. Deploy the rules and hosting:

```bash
firebase deploy --only firestore:rules,storage:rules,hosting
```

Your site is now live at `https://YOUR_PROJECT_ID.web.app`.

To add your own domain: **Hosting → Add custom domain**, then follow the DNS steps.

## 8. Set a budget alert — do not skip this

Blaze has no spending cap by default.

**Google Cloud Console → Billing → Budgets & alerts → Create budget** → set
something like ₹500/month with alerts at 50% / 90% / 100%. This is your safety net
against an unexpected traffic spike or a misconfiguration.

## 9. Lock down the admin account

```bash
# after the first deploy, open the site and change the password immediately
https://YOUR_PROJECT_ID.web.app/admin      # admin / admin123
```

Change it under **Admin → Account**. The server prints a warning on every start
until you do.

---

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **yes** | Service-account JSON. Pass via Secret Manager, not plain env. |
| `FIREBASE_STORAGE_BUCKET` | **yes** | `YOUR_PROJECT_ID.appspot.com` — without it, uploads are lost on restart |
| `SESSION_SECRET` | **yes** | Stable secret so logins survive restarts |
| `FIREBASE_RESTORE` | no | Set to `1` to force a restore over local data |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | no | Enables real email (order + supplier mail) |
| `TWILIO_*` | no | Enables customer phone sign-in. Without it, OTP login is disabled in production. |

`K_SERVICE` is set by Cloud Run automatically — the app uses it to detect that it's
behind a proxy and switch on secure cookies.

---

## Redeploying after changes

```bash
gcloud run deploy shalom-marine-nets --source . --region asia-south1
firebase deploy --only hosting     # only if you changed files in public/
```

## Checking it worked

```bash
gcloud run services logs read shalom-marine-nets --region asia-south1 --limit 50
```

On a healthy cold start you should see:

```
[firebase] Admin initialized — Firestore + Storage + Auth
[firebase] state restored from cloud backup (blank instance)
```

If you instead see the demo products (Purse Seine, Gill Nets…), the restore didn't
happen — check that `FIREBASE_SERVICE_ACCOUNT` is set and that `app/state` exists
in Firestore.

---

## What to watch

**Cold starts.** With `min-instances 0` the first visitor after an idle period waits
a few seconds while the container starts and pulls the backup. Setting
`--min-instances 1` removes that delay but runs continuously (roughly a few hundred
rupees a month). For a B2B catalogue, cold starts are usually an acceptable trade.

**The 1 MB Firestore document limit.** All your data is one document. You're at ~5%
today, but the audit log grows with every admin action and is already half the
payload. Trim it periodically or it will eventually stop the backup — and the
failure is silent, logged only to the console.

**Uploads must go to Storage.** If `FIREBASE_STORAGE_BUCKET` is missing, images save
to the container's disk and vanish on the next cold start. Always verify a newly
uploaded image URL starts with `storage.googleapis.com`.
