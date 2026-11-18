"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { parseTimeToMinutes, computeHoursWorked } from "@/lib/utils";
import {
  collection, query, where, onSnapshot,
  doc, setDoc, getDoc, serverTimestamp,
} from "firebase/firestore";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:MM or ""
  clockOut: string; // HH:MM or ""
  breakStart: string; // HH:MM or ""
  breakEnd: string; // HH:MM or ""
  status: "Present" | "Absent" | "Late" | "Half Day" | "Holiday" | "Weekend";
  hoursWorked: string;
  manuallyMarked?: boolean;
  notes?: string;
};

/** Admin: real-time attendance list for a given date */
export function useAttendanceByDate(date: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    // No orderBy here — avoids composite index requirement; we sort in-memory
    const q = query(
      collection(db, "attendance"),
      where("date", "==", date)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: AttendanceRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            department: data.department ?? "",
            date: data.date ?? date,
            clockIn: data.clockIn ?? "",
            clockOut: data.clockOut ?? "",
            breakStart: data.breakStart ?? "",
            breakEnd: data.breakEnd ?? "",
            status: data.status ?? "Absent",
            hoursWorked: data.hoursWorked ?? "—",
            manuallyMarked: data.manuallyMarked ?? false,
            notes: data.notes ?? "",
          };
        });
        // Sort by employee name in-memory
        rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
        setRecords(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Attendance fetch error:", err);
        setRecords([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [date]);

  return { records, loading };
}

/** Employee: real-time attendance for a given employee (all records) */
export function useEmployeeAttendance(employeeId: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    // No orderBy to avoid composite index requirement; sort in-memory
    const q = query(
      collection(db, "attendance"),
      where("employeeId", "==", employeeId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: AttendanceRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            department: data.department ?? "",
            date: data.date ?? "",
            clockIn: data.clockIn ?? "",
            clockOut: data.clockOut ?? "",
            breakStart: data.breakStart ?? "",
            breakEnd: data.breakEnd ?? "",
            status: data.status ?? "Absent",
            hoursWorked: data.hoursWorked ?? "—",
            manuallyMarked: data.manuallyMarked ?? false,
            notes: data.notes ?? "",
          };
        });
        // Sort by date descending in-memory
        rows.sort((a, b) => b.date.localeCompare(a.date));
        setRecords(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Employee attendance fetch error:", err);
        setRecords([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [employeeId]);

  return { records, loading };
}

/** Write a clock-in record to Firestore.
 *  Resolves department from user/employee profile if not provided directly.
 */
export async function recordClockIn(
  employeeId: string,
  employeeName: string,
  department: string,
  uid?: string
) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);
  const docId = `${employeeId}_${dateStr}`;

  const workStart = 9 * 60; // 09:00
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const status: AttendanceRecord["status"] = currentMins <= workStart + 15 ? "Present" : "Late";

  // Resolve department from Firestore if not provided
  let resolvedDept = department;
  if (!resolvedDept && uid) {
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        resolvedDept = userSnap.data().department ?? "";
      }
      // Also try employees collection for department
      if (!resolvedDept) {
        const { collection: col, query: q, where: w, getDocs } = await import("firebase/firestore");
        const empSnap = await getDocs(q(col(db, "employees"), w("uid", "==", uid)));
        if (!empSnap.empty) resolvedDept = empSnap.docs[0].data().department ?? "";
      }
    } catch {
      // ignore — department will be empty
    }
  }

  await setDoc(
    doc(db, "attendance", docId),
    {
      employeeId,
      employeeName,
      department: resolvedDept,
      date: dateStr,
      clockIn: timeStr,
      status,
      uid: uid ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { timeStr, status };
}

export async function recordClockOut(
  employeeId: string,
  clockInTime: string
) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);
  const docId = `${employeeId}_${dateStr}`;

  // Read existing doc to fetch break timings and existing status
  let breakStart = "";
  let breakEnd = "";
  let currentStatus: AttendanceRecord["status"] = "Present";
  try {
    const existingSnap = await getDoc(doc(db, "attendance", docId));
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      breakStart = data.breakStart || "";
      breakEnd = data.breakEnd || "";
      if (data.status) currentStatus = data.status;
    }
  } catch {
    // proceed with defaults
  }

  // Compute hours worked with break deducted
  const hoursWorked = computeHoursWorked(clockInTime, timeStr, breakStart, breakEnd);

  // Check short day (< 4 hours worked)
  let updatedStatus = currentStatus;
  let notes = "";
  const inMins = parseTimeToMinutes(clockInTime);
  const outMins = parseTimeToMinutes(timeStr);
  if (inMins !== null && outMins !== null && outMins > inMins) {
    let diff = outMins - inMins;
    if (breakStart && breakEnd) {
      const bs = parseTimeToMinutes(breakStart);
      const be = parseTimeToMinutes(breakEnd);
      if (bs !== null && be !== null && be > bs) diff = Math.max(0, diff - (be - bs));
    }
    if (diff < 240) {
      updatedStatus = "Half Day";
      notes = "Short day (< 4h worked)";
    }
  }

  await setDoc(
    doc(db, "attendance", docId),
    {
      clockOut: timeStr,
      hoursWorked,
      status: updatedStatus,
      ...(notes ? { notes } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return timeStr;
}

/** Record break start for an employee */
export async function recordBreakStart(employeeId: string) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);
  const docId = `${employeeId}_${dateStr}`;

  await setDoc(
    doc(db, "attendance", docId),
    {
      breakStart: timeStr,
      breakEnd: "", // clear any previous break end
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return timeStr;
}

/** Record break end for an employee */
export async function recordBreakEnd(employeeId: string) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);
  const docId = `${employeeId}_${dateStr}`;

  await setDoc(
    doc(db, "attendance", docId),
    {
      breakEnd: timeStr,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return timeStr;
}

/** Admin: manually mark or overwrite attendance for any employee on any date */
export async function manualMarkAttendance(
  employeeId: string,
  employeeName: string,
  department: string,
  date: string, // YYYY-MM-DD
  status: AttendanceRecord["status"],
  notes?: string
) {
  const docId = `${employeeId}_${date}`;
  await setDoc(
    doc(db, "attendance", docId),
    {
      employeeId,
      employeeName,
      department,
      date,
      status,
      notes: notes ?? "",
      manuallyMarked: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Admin: delete ALL attendance records for a given employeeId */
export async function clearEmployeeAttendance(employeeId: string): Promise<number> {
  const { getDocs, deleteDoc: del, query: q, collection: col, where: w } = await import("firebase/firestore");
  const snap = await getDocs(q(col(db, "attendance"), w("employeeId", "==", employeeId)));
  await Promise.all(snap.docs.map(d => del(d.ref)));
  return snap.docs.length;
}
