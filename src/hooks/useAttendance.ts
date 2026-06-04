"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, orderBy,
  doc, setDoc, serverTimestamp,
} from "firebase/firestore";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:MM or ""
  clockOut: string; // HH:MM or ""
  status: "Present" | "Absent" | "Late" | "Half Day" | "Holiday" | "Weekend";
  hoursWorked: string;
};

/** Admin: real-time attendance list for a given date */
export function useAttendanceByDate(date: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    const q = query(
      collection(db, "attendance"),
      where("date", "==", date),
      orderBy("employeeName", "asc")
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
            status: data.status ?? "Absent",
            hoursWorked: data.hoursWorked ?? "—",
          };
        });
        setRecords(rows);
        setLoading(false);
      },
      () => {
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
    const q = query(
      collection(db, "attendance"),
      where("employeeId", "==", employeeId),
      orderBy("date", "desc")
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
            status: data.status ?? "Absent",
            hoursWorked: data.hoursWorked ?? "—",
          };
        });
        setRecords(rows);
        setLoading(false);
      },
      () => {
        setRecords([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [employeeId]);

  return { records, loading };
}

/** Write a clock-in or clock-out record to Firestore */
export async function recordClockIn(
  employeeId: string,
  employeeName: string,
  department: string
) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);
  const docId = `${employeeId}_${dateStr}`;

  const workStart = 9 * 60; // 09:00
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const status: AttendanceRecord["status"] = currentMins <= workStart + 15 ? "Present" : "Late";

  await setDoc(
    doc(db, "attendance", docId),
    {
      employeeId,
      employeeName,
      department,
      date: dateStr,
      clockIn: timeStr,
      status,
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

  // Compute hours worked
  let hoursWorked = "—";
  if (clockInTime) {
    const [inH, inM] = clockInTime.split(":").map(Number);
    const [outH, outM] = timeStr.split(":").map(Number);
    const diff = (outH * 60 + outM) - (inH * 60 + inM);
    if (diff > 0) {
      hoursWorked = `${Math.floor(diff / 60)}h ${diff % 60}m`;
    }
  }

  await setDoc(
    doc(db, "attendance", docId),
    {
      clockOut: timeStr,
      hoursWorked,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return timeStr;
}
