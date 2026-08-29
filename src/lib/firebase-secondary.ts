import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";

const SECONDARY_APP_NAME = "ems-secondary";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getSecondaryAuth() {
  const secondaryApp =
    getApps().find((a) => a.name === SECONDARY_APP_NAME) ||
    initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
}

/**
 * Creates a Firebase Auth account for an employee.
 * If the email is already in use and password matches, recovers the UID.
 */
export async function createEmployeeAuth(
  name: string,
  password: string
): Promise<{ uid: string; email: string }> {
  const email = `${name.toLowerCase().replace(/\s+/g, '')}@makewithus.in`;
  const secondaryAuth = getSecondaryAuth();

  let uid = "";
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    uid = cred.user.uid;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "auth/email-already-in-use") {
      try {
        const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
        uid = cred.user.uid;
      } catch {
        throw new Error("This email is already in use by another account.");
      }
    } else {
      throw error;
    }
  } finally {
    await signOut(secondaryAuth);
  }

  return { uid, email };
}

/**
 * Updates an employee's auth credentials.
 *
 * Strategy:
 * - If only the password changed (same email): sign in with old creds → updatePassword
 * - If the email changed: create a brand new auth account with the new email
 *   (Firebase client SDK does NOT allow updateEmail without email verification,
 *    so we bypass it entirely by creating a fresh account)
 */
export async function updateEmployeeAuth(
  oldEmail: string,
  oldPassword: string,
  newEmail: string,
  newPassword?: string
): Promise<{ email: string; uid?: string }> {
  const secondaryAuth = getSecondaryAuth();
  const emailChanged = oldEmail.toLowerCase() !== newEmail.toLowerCase();
  const finalPassword = newPassword?.trim() || oldPassword;

  try {
    // ── Case 1: Email has NOT changed — just update password on existing account ──
    if (!emailChanged) {
      if (newPassword && newPassword.trim()) {
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, oldEmail, oldPassword);
          await updatePassword(cred.user, newPassword);
          return { email: oldEmail };
        } catch (signInErr: any) {
          // If old password is wrong/account lost, create fresh account with same email
          // (This handles cases where stored password got out of sync)
          try {
            const newCred = await createUserWithEmailAndPassword(secondaryAuth, oldEmail, newPassword);
            return { email: oldEmail, uid: newCred.user.uid };
          } catch (createErr: any) {
            if (createErr.code === "auth/email-already-in-use") {
              throw new Error("Cannot update password — the stored password is out of sync. Please set a new Login Email to reset this employee's credentials.");
            }
            throw createErr;
          }
        }
      }
      // No password change either — nothing to do
      return { email: oldEmail };
    }

    // ── Case 2: Email HAS changed — create a brand new auth account ──
    try {
      const newCred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, finalPassword);
      return { email: newEmail, uid: newCred.user.uid };
    } catch (createErr: any) {
      if (createErr.code === "auth/email-already-in-use") {
        // Email already exists — try to sign in with the target password
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, newEmail, finalPassword);
          // If sign-in works, the account already exists with this password — just use it
          if (newPassword && newPassword.trim()) {
            await updatePassword(cred.user, newPassword);
          }
          return { email: newEmail, uid: cred.user.uid };
        } catch {
          throw new Error("This email is already in use by another account with a different password.");
        }
      }
      throw createErr;
    }
  } finally {
    await signOut(secondaryAuth);
  }
}

