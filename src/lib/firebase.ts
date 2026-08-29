import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Next.js only inlines NEXT_PUBLIC_* vars when the key is a static literal.
// Dynamic access (process.env[variable]) is always undefined in the browser bundle.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Warn at startup if env vars are missing — but don't throw at module level
// (a module-level throw corrupts Next.js webpack chunks and causes SSR crashes)
const missing = Object.entries(firebaseConfig)
  .filter(([key, val]) => key !== "measurementId" && !val)
  .map(([key]) => key);

if (missing.length && typeof window !== "undefined") {
  console.warn(`[Firebase] Missing env vars: ${missing.join(", ")}. Check .env.local`);
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

export default app;

