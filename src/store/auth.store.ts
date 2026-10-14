"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { UserProfile, Role } from "@/types";

const ADMIN_ROLES: Role[] = ["super_admin", "hr_admin"];

function normalizeRole(role: unknown): Role | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "super_admin" || normalized === "hr_admin" || normalized === "employee") {
    return normalized;
  }
  return null;
}

function clearSessionCookies() {
  document.cookie = "ems-session=; path=/; max-age=0";
  document.cookie = "ems-role=; path=/; max-age=0";
}

function setSessionCookies(role: Role) {
  document.cookie = `ems-session=1; path=/; max-age=${60 * 60 * 24 * 7}`;
  document.cookie = `ems-role=${role}; path=/; max-age=${60 * 60 * 24 * 7}`;
}

export function isAdminRole(role: Role | null | undefined) {
  return !!role && ADMIN_ROLES.includes(role);
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  companyId: string | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string, requiredPortal?: "admin" | "employee") => Promise<{ role: Role }>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  fetchProfile: (uid: string) => Promise<{ role: Role }>;
  setUser: (user: User | null) => void;
  setLoading: (v: boolean) => void;
  setInitialized: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      role: null,
      companyId: null,
      loading: true,
      initialized: false,

      signIn: async (email, password, requiredPortal) => {
        set({ loading: true });
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          const result = await get().fetchProfile(cred.user.uid);

          if (requiredPortal === "admin" && !isAdminRole(result.role)) {
            throw new Error("This account does not have admin access.");
          }

          if (requiredPortal === "employee" && result.role !== "employee") {
            throw new Error("This account is an admin account. Please use the admin portal.");
          }

          setSessionCookies(result.role);
          set({ user: cred.user, loading: false, initialized: true });
          return { role: result.role };
        } catch (error) {
          clearSessionCookies();
          set({ user: null, profile: null, role: null, companyId: null, loading: false, initialized: true });
          await firebaseSignOut(auth).catch((err) => console.error("Firebase signout error:", err));
          throw error;
        }
      },

      signOut: async () => {
        // Synchronously reset state and session cookie to navigate instantly
        set({ user: null, profile: null, role: null, companyId: null });
        clearSessionCookies();
        // Trigger Firebase signout asynchronously in the background
        firebaseSignOut(auth).catch((err) => console.error("Firebase signout error:", err));
      },

      sendReset: async (email) => {
        await sendPasswordResetEmail(auth, email);
      },

      fetchProfile: async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const data = snap.data();
            const role = normalizeRole(data.role);
            if (!role) {
              throw new Error("Your account role is invalid. Please contact an administrator.");
            }

            const profile = {
              ...data,
              uid,
              role,
              email: data.email ?? auth.currentUser?.email ?? "",
              displayName: data.displayName ?? data.name ?? auth.currentUser?.displayName ?? auth.currentUser?.email ?? "User",
              companyId: data.companyId ?? "makewithus",
            } as UserProfile;

            set({ profile, role, companyId: profile.companyId ?? null });
            return { role };
          }

          throw new Error("No EMS user profile was found for this login. Please contact an administrator.");
        } catch (error) {
          set({ profile: null, role: null, companyId: null });
          throw error;
        }
      },

      setUser: (user) => set({ user }),
      setLoading: (v) => set({ loading: v }),
      setInitialized: (v) => set({ initialized: v }),
    }),
    {
      name: "ems-auth",
      partialize: (s) => ({ role: s.role, companyId: s.companyId }),
    }
  )
);
