// Script to clear all attendance records for Nimisha
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { readFileSync } from "fs";

// Load env
const env = readFileSync(".env.local", "utf-8");
const cfg = {};
env.split("\n").forEach(line => {
  const [k, ...v] = line.trim().split("=");
  if (k && v.length) cfg[k.trim()] = v.join("=").trim();
});

const firebaseConfig = {
  apiKey:            cfg.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        cfg.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     cfg.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: cfg.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             cfg.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function clearNimisha() {
  // Search attendance where employeeName contains "Nimisha" (case-insensitive via prefix search not possible, so fetch all and filter)
  const snap = await getDocs(collection(db, "attendance"));
  
  const toDelete = snap.docs.filter(d => {
    const name = (d.data().employeeName ?? "").toLowerCase();
    return name.includes("nimisha");
  });

  if (toDelete.length === 0) {
    console.log("No attendance records found for Nimisha.");
    process.exit(0);
  }

  console.log(`Found ${toDelete.length} record(s) for Nimisha. Deleting...`);
  
  for (const d of toDelete) {
    console.log(`  Deleting: ${d.id} (${d.data().date}) — ${d.data().status}`);
    await deleteDoc(doc(db, "attendance", d.id));
  }

  console.log(`✅ Done! Cleared ${toDelete.length} attendance record(s) for Nimisha.`);
  process.exit(0);
}

clearNimisha().catch(e => { console.error("Error:", e.message); process.exit(1); });
