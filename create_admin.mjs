import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import fs from 'fs';
import path from 'path';

// Parse .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    const email = "admin_test@makewithus.in";
    const pass = "admin123456";

    let uid;
    try {
      console.log("Attempting to register:", email);
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      uid = cred.user.uid;
      console.log("Registered successfully. UID:", uid);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        console.log("Email already in use, signing in instead...");
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
        console.log("Logged in. UID:", uid);
      } else {
        throw e;
      }
    }

    // Since firestore rules allow users to create their own user document without role validation:
    // allow create: if isSignedIn() && request.auth.uid == userId;
    console.log("Setting role to super_admin in Firestore...");
    await setDoc(doc(db, "users", uid), {
      email: email,
      role: "super_admin",
      status: "Active",
      createdAt: new Date(),
    }, { merge: true });

    console.log("Successfully created/updated super_admin account.");
    console.log("Email:", email);
    console.log("Password:", pass);

    process.exit(0);
  } catch (err) {
    console.error("Error during admin creation:", err);
    process.exit(1);
  }
}

run();
