/**
 * Optional Firebase Admin integration — Storage + Firestore + Auth.
 *
 * Works "alongside" the existing JSON store: enabled ONLY when credentials are
 * present. When not configured, every helper safely no-ops and the app runs
 * exactly as before (JSON file store + local disk uploads + phone-OTP auth).
 *
 * To enable:
 *   1) npm install firebase-admin
 *   2) Provide a service account, either:
 *        - place the JSON at   ./serviceAccountKey.json   (git-ignored), OR
 *        - set env FIREBASE_SERVICE_ACCOUNT to the JSON string or a file path
 *   3) (Storage) set env  FIREBASE_STORAGE_BUCKET=your-project.appspot.com
 *
 * What it does when enabled:
 *   - Storage:   uploaded images/video go to Firebase Storage (public URL returned)
 *   - Firestore: the whole app state is mirrored (live cloud backup) on every save
 *   - Auth:      verifyIdToken() lets the client sign in with Firebase Auth
 */
const fs = require('fs');
const path = require('path');

let admin = null, app = null, _db = null, _bucket = null, enabled = false;

(function init() {
  let creds = null;
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT;
  const filePath = path.join(__dirname, 'serviceAccountKey.json');
  try {
    if (envVal) creds = envVal.trim().startsWith('{') ? JSON.parse(envVal) : JSON.parse(fs.readFileSync(envVal, 'utf8'));
    else if (fs.existsSync(filePath)) creds = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { console.error('[firebase] could not read service account:', e.message); }
  if (!creds) { console.log('[firebase] not configured — running on local JSON store (add serviceAccountKey.json to enable).'); return; }
  try {
    admin = require('firebase-admin');                 // lazy require — only when configured
    app = admin.initializeApp({
      credential: admin.credential.cert(creds),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    });
    _db = admin.firestore();
    if (process.env.FIREBASE_STORAGE_BUCKET) _bucket = admin.storage().bucket();
    enabled = true;
    console.log('[firebase] Admin initialized' + (_bucket ? ' — Firestore + Storage + Auth' : ' — Firestore + Auth (no bucket set)'));
  } catch (e) {
    console.error('[firebase] init failed (did you run `npm install firebase-admin`?):', e.message);
    enabled = false;
  }
})();

const firebaseEnabled = () => enabled;
const storageEnabled = () => enabled && !!_bucket;

/** Upload a local file (already written by multer) to Firebase Storage; returns a public URL. */
async function uploadToStorage(localPath, filename, contentType) {
  if (!storageEnabled()) return null;
  const dest = `uploads/${filename}`;
  await _bucket.upload(localPath, {
    destination: dest,
    metadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });
  await _bucket.file(dest).makePublic();
  return `https://storage.googleapis.com/${_bucket.name}/${dest}`;
}

/** Mirror the entire app state to Firestore (debounced by the caller). */
let _saving = false, _pending = null;
async function saveState(state) {
  if (!enabled) return;
  if (_saving) { _pending = state; return; }
  _saving = true;
  try {
    await _db.collection('app').doc('state').set({ json: JSON.stringify(state), updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[firebase] saveState failed:', e.message);
  } finally {
    _saving = false;
    if (_pending) { const s = _pending; _pending = null; saveState(s); }
  }
}

/** Restore the app state from Firestore (used to seed a fresh install from the cloud backup). */
async function loadState() {
  if (!enabled) return null;
  try {
    const doc = await _db.collection('app').doc('state').get();
    if (doc.exists && doc.data().json) return JSON.parse(doc.data().json);
  } catch (e) { console.error('[firebase] loadState failed:', e.message); }
  return null;
}

/** Verify a Firebase Auth ID token minted on the client. Returns decoded token or null. */
async function verifyIdToken(idToken) {
  if (!enabled || !idToken) return null;
  try { return await admin.auth().verifyIdToken(idToken); }
  catch { return null; }
}

module.exports = { firebaseEnabled, storageEnabled, uploadToStorage, saveState, loadState, verifyIdToken };
