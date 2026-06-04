"use client";
import { useState } from "react";
import { Clock, Play, Square, Coffee, ChevronDown, Loader2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { useAttendanceStore } from "@/store/attendance.store";
import { formatDate } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import {
  useAttendanceByDate,
  useEmployeeAttendance,
  recordClockIn,
  recordClockOut,
} from "@/hooks/useAttendance";
import AttendanceCalendarModal from "@/components/attendance/AttendanceCalendarModal";

const statusBadge: Record<string, { bg: string; color: string }> = {
  Present:    { bg: "var(--accent-green-dim)",  color: "var(--accent-green)" },
  Absent:     { bg: "var(--accent-red-dim)",    color: "var(--accent-red)" },
  Late:       { bg: "var(--accent-amber-dim)",  color: "var(--accent-amber)" },
  "Half Day": { bg: "var(--accent-purple-dim)", color: "var(--accent-purple)" },
  Holiday:    { bg: "var(--accent-blue-dim)",   color: "var(--accent-blue)" },
};

export default function AttendancePage() {
  const { role, profile } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";
  const { clockInTime, clockOutTime, clockIn, clockOut, continueWork } = useAttendanceStore();
  const [dept, setDept] = useState("All");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [clocking, setClocking] = useState(false);
  const { departments } = useDepartments();
  const today = formatDate(new Date().toISOString());

  // Admin: real-time attendance for selected date
  const { records: adminRecords, loading: adminLoading } = useAttendanceByDate(
    isAdmin ? selectedDate : ""
  );

  // Employee: their own full attendance history
  const employeeId = profile?.employeeId ?? "";
  const { records: empRecords, loading: empLoading } = useEmployeeAttendance(
    !isAdmin ? employeeId : ""
  );

  const filteredAdmin = adminRecords.filter(
    (r) => dept === "All" || r.department === dept
  );

  // Admin summary stats
  const stats = {
    Present:  filteredAdmin.filter((r) => r.status === "Present" || r.status === "Late").length,
    Absent:   filteredAdmin.filter((r) => r.status === "Absent").length,
    Late:     filteredAdmin.filter((r) => r.status === "Late").length,
    "Half Day": filteredAdmin.filter((r) => r.status === "Half Day").length,
  };

  const handleClockIn = async () => {
    setClocking(true);
    try {
      clockIn();
      if (employeeId) {
        await recordClockIn(
          employeeId,
          profile?.displayName ?? "Employee",
          ""
        );
      }
      toast.success("Clocked in successfully!");
    } catch {
      toast.error("Clock-in failed. Try again.");
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    setClocking(true);
    try {
      clockOut();
      if (employeeId) {
        await recordClockOut(employeeId, clockInTime ?? "");
      }
      toast.success("Clocked out successfully!");
    } catch {
      toast.error("Clock-out failed. Try again.");
    } finally {
      setClocking(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">
            {isAdmin ? `Daily attendance — ${today}` : "Track your daily attendance"}
          </p>
        </div>
        {!isAdmin && (
          <button
            id="att-calendar-view"
            className="btn btn-secondary"
            style={{ gap: 6 }}
            onClick={() => setShowCalendar(true)}
          >
            <CalendarDays size={14} /> Quick View
          </button>
        )}
      </div>

      {/* Employee Calendar Modal */}
      {showCalendar && !isAdmin && (
        <AttendanceCalendarModal
          employeeId={employeeId}
          employeeName={profile?.displayName ?? "Employee"}
          records={empRecords}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {/* Employee Clock Widget */}
      {!isAdmin && (
        <div className="card" style={{ padding: 24, maxWidth: 480, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>Today&apos;s Attendance</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Clock In",  value: clockInTime || "—", color: clockInTime ? "var(--accent-green)" : "var(--text-muted)" },
              { label: "Clock Out", value: clockOutTime || "—", color: clockOutTime ? "var(--accent-blue)" : "var(--text-muted)" },
            ].map((i) => (
              <div key={i.label} style={{ padding: "14px 16px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{i.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: i.color }}>{i.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {!clockInTime ? (
              <button
                id="att-clockin"
                onClick={handleClockIn}
                disabled={clocking}
                className="btn btn-primary"
                style={{ gap: 6, gridColumn: "1/-1" }}
              >
                {clocking ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Clock In
              </button>
            ) : !clockOutTime ? (
              <button
                id="att-clockout"
                onClick={handleClockOut}
                disabled={clocking}
                className="btn btn-secondary"
                style={{ gap: 6, gridColumn: "1/-1" }}
              >
                {clocking ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                Clock Out
              </button>
            ) : (
              <button
                id="att-continue"
                onClick={() => { continueWork(); toast.success("Resumed working"); }}
                className="btn btn-primary"
                style={{ gap: 6, gridColumn: "1/-1" }}
              >
                <Play size={14} /> Continue Work
              </button>
            )}
            <button id="att-break-start" className="btn btn-secondary" style={{ gap: 6, gridColumn: "1/-1" }}>
              <Coffee size={14} /> Start Break
            </button>
          </div>
        </div>
      )}

      {/* Employee: recent attendance list */}
      {!isAdmin && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Recent Attendance</div>
          {empLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13 }}>
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : empRecords.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>
              No attendance records yet.
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {empRecords.slice(0, 30).map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 13 }}>{r.date ? formatDate(r.date) : "—"}</td>
                      <td style={{ fontSize: 13, color: "var(--accent-green)", fontWeight: 500 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={12} />{r.clockIn || "—"}
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.clockOut || "—"}</td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{r.hoursWorked}</td>
                      <td>
                        <span className="badge" style={{ background: statusBadge[r.status]?.bg, color: statusBadge[r.status]?.color }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Admin: Daily table */}
      {isAdmin && (
        <>
          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Present",   value: stats.Present,    color: "var(--accent-green)" },
              { label: "Absent",    value: stats.Absent,     color: "var(--accent-red)" },
              { label: "Late",      value: stats.Late,       color: "var(--accent-amber)" },
              { label: "Half Day",  value: stats["Half Day"], color: "var(--accent-purple)" },
            ].map((s) => (
              <div key={s.label} className="card" style={{ padding: "14px 18px" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ position: "relative" }}>
              <select
                id="att-filter-dept"
                className="input-base"
                style={{ paddingRight: 32, appearance: "none", minWidth: 160 }}
                value={dept}
                onChange={(e) => setDept(e.target.value)}
              >
                <option value="All">All Departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            </div>
            <input
              id="att-filter-date"
              type="date"
              className="input-base"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: "auto" }}
            />
          </div>

          {adminLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "var(--text-muted)", gap: 10 }}>
              <Loader2 size={18} className="animate-spin" />
              <span style={{ fontSize: 13 }}>Loading attendance…</span>
            </div>
          ) : filteredAdmin.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
              <Clock size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 14 }}>No attendance records for {formatDate(selectedDate)}</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>Records will appear here once employees clock in.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmin.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent-blue-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "var(--accent-blue)" }}>
                            {r.employeeName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{r.employeeName}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.employeeId}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{r.department}</td>
                      <td style={{ fontSize: 13, color: "var(--accent-green)", fontWeight: 500 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={12} />{r.clockIn || "—"}
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.clockOut || "—"}</td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{r.hoursWorked}</td>
                      <td>
                        <span className="badge" style={{ background: statusBadge[r.status]?.bg, color: statusBadge[r.status]?.color }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
