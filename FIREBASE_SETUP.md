# Firebase Setup — Storage, Firestore & Auth

Firebase is **optional and additive**. With no configuration the site runs exactly as before
(local `data/app.json` store, local `public/uploads`, phone-OTP auth). When you add
credentials it layers in three things:

| Service | What it does here | Status |
|---|---|---|
| **Firestore** | Live cloud backup/mirror of the whole app state on every save; optional restore on boot | server-side (Admin SDK) |
| **Storage** | Uploaded product/hero images & video go to Firebase Storage; public URLs are returned | server-side (Admin SDK) |
| **Auth** | Verify a Firebase ID token (phone/Google/email) → sign the customer in | server route ready |

Nothing else in the app changes — the JSON store stays the primary source of truth, so you
can turn Firebase off at any time with zero data loss.

---

## 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project**.
2. Enable **Firestore Database** (Production mode is fine).
3. Enable **Storage** and note the bucket name (looks like `your-project.appspot.com`).
4. Enable **Authentication** and turn on the sign-in methods you want (Phone, Google, Email).

## 2. Get a service account (server credentials)
1. Project settings → **Service accounts** → **Generate new private key** → download the JSON.
2. Save it in the project root as **`serviceAccountKey.json`** (already git-ignored).
   - Alternatively set env `FIREBASE_SERVICE_ACCOUNT` to the JSON string or a file path.

## 3. Install & configure
```bash
npm install                                  # pulls firebase-admin (now in package.json)
# PowerShell (Windows):
$env:FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
npm start
```
On boot you'll see: `Firebase -> Firestore + Storage + Auth`. If you skip the bucket you'll get
`Firestore + Auth`; if you skip everything, `disabled (local mode)`.

Environment variables:
- `FIREBASE_SERVICE_ACCOUNT` — JSON string or path (optional if you use the file).
- `FIREBASE_STORAGE_BUCKET` — enables Storage uploads.
- `FIREBASE_RESTORE=1` — on next boot, replace the local state with the Firestore backup
  (use only when migrating to a fresh machine).

## 4. How each piece works

**Storage** — `POST /api/upload` and `/api/upload-media` automatically push files to
`gs://<bucket>/uploads/...`, make them public, and return `https://storage.googleapis.com/...`
URLs. If a single upload fails it falls back to the local path, so the admin never breaks.

**Firestore** — every `store` mutation writes `data/app.json` locally **and** (debounced 1.5s)
mirrors the full state to Firestore at `app/state`. This is a cloud backup you can restore
with `FIREBASE_RESTORE=1`. *Note:* Firestore documents are capped at ~1 MB; this whole-state
mirror is ideal up to a few thousand orders. To scale beyond that, split into per-document
collections (see "Going further" below).

**Auth** — the server exposes `POST /api/customer/firebase-login` expecting `{ idToken, name? }`.
It verifies the token with the Admin SDK and logs the matching customer in (by phone or email),
creating them if new. The existing phone-OTP flow keeps working; Firebase Auth is an alternative.

## 5. (Optional) Client-side Firebase Auth
1. Fill in `public/js/firebase-config.js` with your web app config (Project settings → Your apps
   → Web). These values are safe in the browser.
2. Add the Firebase web SDK + your sign-in UI, obtain the ID token, and:
   ```js
   const idToken = await firebase.auth().currentUser.getIdToken();
   await fetch('/api/customer/firebase-login', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ idToken })
   });
   ```
   The storefront's `/api/public/site` response includes `firebase_auth: true` when the server
   is configured, so you can conditionally show a "Sign in with Firebase" button.

## 6. Security rules (recommended)
Because the **server** holds the service account and verifies ID tokens, you can lock down
client access. Minimal Firestore rule (server bypasses rules via the Admin SDK):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents { match /{document=**} { allow read, write: if false; } }
}
```
Storage rule to allow public read of uploaded assets only:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o { match /uploads/{file=**} { allow read: if true; allow write: if false; } }
}
```

## Going further (full Firestore migration)
This build uses Firestore as a **mirror** (the JSON file stays primary — matching the
"add alongside" choice). To make Firestore the primary store, replace `db.js`'s `load()` /
`persist()` with per-collection reads/writes (one document per product/order/customer) and
remove the file writes. The store API surface stays identical, so the rest of the app is
unaffected.
