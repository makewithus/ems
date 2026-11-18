import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

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

function getOrInitApp(): FirebaseApp {
  if (getApps().length) return getApp();

  // If running in a server-side build step without configured env vars,
  // provide a placeholder so static HTML prerendering succeeds without crashing.
  // In runtime and in the browser, real environment variables are required and used.
  if (!firebaseConfig.apiKey && typeof window === "undefined") {
    return initializeApp({
      apiKey: "build-prerender-placeholder-key",
      authDomain: "build-prerender-placeholder.firebaseapp.com",
      projectId: "build-prerender-placeholder",
    });
  }

  return initializeApp(firebaseConfig);
}

const app = getOrInitApp();

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export default app;

