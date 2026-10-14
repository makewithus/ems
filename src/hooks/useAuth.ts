"use client";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/auth.store";

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await store.fetchProfile(user.uid);
          store.setUser(user);
          const role = useAuthStore.getState().role;
          document.cookie = `ems-session=1; path=/; max-age=${60 * 60 * 24 * 7}`;
          if (role) document.cookie = `ems-role=${role}; path=/; max-age=${60 * 60 * 24 * 7}`;
        } catch (error) {
          console.error("[Auth] Invalid session:", error);
          document.cookie = "ems-session=; path=/; max-age=0";
          document.cookie = "ems-role=; path=/; max-age=0";
          store.setUser(null);
          await auth.signOut().catch((err) => console.error("Firebase signout error:", err));
        }
        store.setLoading(false);
        store.setInitialized(true);
      } else {
        document.cookie = "ems-session=; path=/; max-age=0";
        document.cookie = "ems-role=; path=/; max-age=0";
        store.setUser(null);
        store.setLoading(false);
        store.setInitialized(true);
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}
