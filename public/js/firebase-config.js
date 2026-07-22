/**
 * OPTIONAL client-side Firebase config (for Firebase Auth / Analytics in the browser).
 *
 * The site works WITHOUT this file — the server keeps using phone-OTP auth. Fill this in
 * only if you want customers to sign in with the Firebase Auth SDK in the browser.
 *
 * 1) Firebase console → Project settings → "Your apps" → Web app → copy the config.
 * 2) Paste the values below.
 * 3) Include this file + the Firebase web SDK in index.html, then call your sign-in flow,
 *    get the ID token, and POST it to /api/customer/firebase-login (already implemented).
 *
 * These values are NOT secrets — they identify the project to Firebase and are safe in the
 * browser. Access is controlled by Firebase Security Rules + the server verifying ID tokens.
 */
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",           // your-project.firebaseapp.com
  projectId: "",
  storageBucket: "",        // your-project.appspot.com
  messagingSenderId: "",
  appId: "",
};
