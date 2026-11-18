import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Next.js only inlines NEXT_PUBLIC_* vars when the key is a static literal.
// Dynamic access (process.env[variable]) is always undefined in the browser bundle.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDycnVYG0dUoSYu5KYWwv1ZP0cDX_bvldQ",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mwu-ms.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mwu-ms",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "mwu-ms.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "458872225232",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:458872225232:web:83c67341afdc64feb14dd5",
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

