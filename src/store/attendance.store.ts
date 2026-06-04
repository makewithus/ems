"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AttendanceState {
  clockInTime: string | null;
  clockOutTime: string | null;
  clockIn: () => void;
  clockOut: () => void;
  continueWork: () => void;
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set) => ({
      clockInTime: null,
      clockOutTime: null,
      clockIn: () => {
        const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        set({ clockInTime: now, clockOutTime: null });
      },
      clockOut: () => {
        const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        set({ clockOutTime: now });
      },
      continueWork: () => set({ clockOutTime: null }),
    }),
    {
      name: "ems-attendance",
    }
  )
);
