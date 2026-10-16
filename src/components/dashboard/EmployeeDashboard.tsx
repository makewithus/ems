"use client";
import { useState, useEffect, useMemo } from "react";
import { Clock, CalendarDays, DollarSign, Flame, Play, RefreshCw, Square, Loader2, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { useAttendanceStore } from "@/store/attendance.store";
import { useEmployeeAttendance, recordClockIn, recordClockOut } from "@/hooks/useAttendance";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, orderBy, limit,
} from "firebase/firestore";
import { formatCurrency } from "@/lib/utils";

const tooltipStyle = {
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};

const priorityColor: Record<string, string> = {
  Urgent:   "var(--accent-red)",
  Critical: "var(--accent-red)",
  Normal:   "var(--accent-blue)",
  Low:      "var(--text-muted)",
};

const parseHours = (hStr: string | undefined): number => {
  if (!hStr || hStr === "—") return 0;
  const match = hStr.match(/(\d+)h(?:\s*(\d+)m)?/);
  if (match) {
    const hrs = parseInt(match[1], 10);
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    return hrs + mins / 60;
  }
  return 0;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function EmployeeDashboard() {
  const { profile, user } = useAuthStore();
  const { clockIn, clockOut, continueWork } = useAttendanceStore();

  const employeeId = profile?.employeeId ?? "";
  const todayStr = new Date().toISOString().split("T")[0];

  // Calendar state
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(
    today.toISOString().split("T")[0]
  );

  // Live attendance records
  const { records: empRecords, loading: empLoading } = useEmployeeAttendance(
    employeeId ? employeeId : ""
  );

  // Today's record
  const todayRecord = useMemo(
    () => empRecords.find((r) => r.date === todayStr) ?? null,
    [empRecords, todayStr]
  );

  // Map records by date for easy access
  const recordsMap = useMemo(() => {
    const map: Record<string, typeof empRecords[0]> = {};
    empRecords.forEach((r) => {
      if (r.date) map[r.date] = r;
    });
    return map;
  }, [empRecords]);

  // Employee data state
  const [salaryDate, setSalaryDate] = useState<string>("");
  const [joiningDate, setJoiningDate] = useState<string>("");

  // Fetch salary date from employee record
  useEffect(() => {
    if (!employeeId) return;
    // Find employee doc by employeeId field
    const empQuery = query(collection(db, "employees"), where("employeeId", "==", employeeId), limit(1));
    const unsub = onSnapshot(empQuery, (snap) => {
      if (!snap.empty) {
        setSalaryDate(snap.docs[0].data().salaryDate ?? "");
        setJoiningDate(snap.docs[0].data().joiningDate ?? "");
      }
    }, () => {});
    return () => unsub();
  }, [employeeId]);

  // Compute adjusted payment date
  const paymentInfo = useMemo(() => {
    if (!salaryDate) return null;
    const now = new Date();
    const cMonth = now.getMonth();
    const cYear = now.getFullYear();
    
    let absentCount = 0;
    const startOfMonth = new Date(cYear, cMonth, 1);
    const joinDateObj = joiningDate ? new Date(joiningDate) : new Date(0);
    const startCountDate = startOfMonth > joinDateObj ? startOfMonth : joinDateObj;
    
    const endCountDate = new Date(cYear, cMonth, now.getDate()); // up to yesterday (since <)

    const current = new Date(startCountDate);
    while (current < endCountDate) {
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      if (!isWeekend) {
        const dStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        const rec = recordsMap[dStr];
        if (!rec || rec.status === "Absent") {
          absentCount++;
        }
      }
      current.setDate(current.getDate() + 1);
    }

    try {
      const base = new Date(salaryDate);
      if (isNaN(base.getTime())) return null;
      const payDate = new Date(cYear, cMonth, base.getDate());
      payDate.setDate(payDate.getDate() + absentCount);
      return {
        baseDayOfMonth: base.getDate(),
        absentCount,
        adjustedDate: payDate,
      };
    } catch {
      return null;
    }
  }, [salaryDate, joiningDate, recordsMap]);

  // Selected date details
  const selectedRecord = useMemo(() => {
    if (!selectedCalendarDate) return null;
    return recordsMap[selectedCalendarDate] ?? null;
  }, [selectedCalendarDate, recordsMap]);

  // Calendar cells generation
  const firstDayIndex = useMemo(() => {
    return new Date(calendarYear, calendarMonth, 1).getDay();
  }, [calendarYear, calendarMonth]);

  const totalDaysInMonth = useMemo(() => {
    return new Date(calendarYear, calendarMonth + 1, 0).getDate();
  }, [calendarYear, calendarMonth]);

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [
      ...Array(firstDayIndex).fill(null),
      ...Array.from({ length: totalDaysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [firstDayIndex, totalDaysInMonth]);

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    const currentToday = new Date();
    if (calendarYear === currentToday.getFullYear() && calendarMonth >= currentToday.getMonth()) {
      return;
    }
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  const hasClockedIn  = !!todayRecord?.clockIn;
  const hasClockedOut = !!todayRecord?.clockOut;
  const [clocking, setClocking] = useState(false);

  // Live notices
  const [notices, setNotices] = useState<{ id: string; title: string; priority: string; createdAt: string }[]>([]);
  useEffect(() => {
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(3));
    const unsub = onSnapshot(q, (snap) => {
      setNotices(snap.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toDate?.() ?? null;
        return {
          id: d.id,
          title: data.title ?? "",
          priority: data.priority ?? "Normal",
          createdAt: ts ? ts.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
        };
      }));
    }, () => {});
    return () => unsub();
  }, []);

  // Live payslip (latest)
  const [latestPayslip, setLatestPayslip] = useState<{ net: number; month: string; status: string } | null>(null);
  useEffect(() => {
    if (!employeeId) return;
    const q = query(
      collection(db, "payroll"),
      where("employeeId", "==", employeeId),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setLatestPayslip({ net: d.net ?? 0, month: d.month ?? "", status: d.status ?? "Generated" });
      }
    }, () => {});
    return () => unsub();
  }, [employeeId]);

  // Compute login streak from attendance records
  const loginStreak = useMemo(() => {
    if (empRecords.length === 0) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      // Skip weekends
      const day = d.getDay();
      if (day === 0 || day === 6) continue;
      const rec = empRecords.find((r) => r.date === dateStr);
      if (rec && (rec.status === "Present" || rec.status === "Late")) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [empRecords]);

  // Last 5 working days activity data
  const activityData = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const today = new Date();
    const result: { day: string; hours: number }[] = [];
    let dayIdx = 0;
    let i = 0;
    while (result.length < 5 && i < 14) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      i++;
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      const dateStr = d.toISOString().split("T")[0];
      const rec = empRecords.find((r) => r.date === dateStr);
      let hours = 0;
      if (rec?.clockIn && rec?.clockOut) {
        const [inH, inM] = rec.clockIn.split(":").map(Number);
        const [outH, outM] = rec.clockOut.split(":").map(Number);
        const diff = (outH * 60 + outM) - (inH * 60 + inM);
        hours = Math.max(0, parseFloat((diff / 60).toFixed(1)));
      }
      result.unshift({ day: days[dow === 0 ? 6 : dow - 1] ?? `D${dayIdx}`, hours });
      dayIdx++;
    }
    return result;
  }, [empRecords]);

  // Format 24h time to 12h
  function fmt24to12(t: string): string {
    if (!t) return "—";
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }

  const handleAction = async () => {
    if (!hasClockedIn) {
      setClocking(true);
      try {
        if (employeeId) {
          await recordClockIn(
            employeeId,
            profile?.displayName ?? "Employee",
            profile?.department ?? "",
            user?.uid
          );
        }
        clockIn();
        toast.success("Clocked in successfully!");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        toast.error(e.message || "Clock-in failed.");
      } finally {
        setClocking(false);
      }
    } else if (!hasClockedOut) {
      setClocking(true);
      try {
        if (employeeId) {
          await recordClockOut(employeeId, todayRecord?.clockIn ?? "");
        }
        clockOut();
        toast.success("Clocked out successfully!");
      } catch {
        toast.error("Clock-out failed.");
      } finally {
        setClocking(false);
      }
    } else {
      continueWork();
      toast.success("Resumed working!");
    }
  };

  // Build STATS dynamically
  const todayStatus = empLoading ? "—" :
    todayRecord ? todayRecord.status :
    hasClockedIn ? "Present" : "Not Clocked In";

  const STATS = [
    {
      label: "Today's Status",
      value: todayStatus,
      icon: Clock,
      color: todayStatus === "Present" ? "var(--accent-green)" : todayStatus === "Late" ? "var(--accent-amber)" : "var(--text-muted)",
      sub: todayRecord?.clockIn ? `Clocked in at ${fmt24to12(todayRecord.clockIn)}` : "Not clocked in yet",
    },
    {
      label: "Login Streak",
      value: `${loginStreak} Day${loginStreak !== 1 ? "s" : ""}`,
      icon: Flame,
      color: loginStreak >= 5 ? "var(--accent-amber)" : "var(--text-muted)",
      sub: loginStreak >= 5 ? "Keep it up! Consistent streak" : loginStreak > 0 ? "You're on a roll!" : "Clock in to start streak",
    },
    {
      label: "Salary Status",
      value: latestPayslip ? latestPayslip.status : "—",
      icon: DollarSign,
      color: "var(--accent-purple)",
      sub: latestPayslip
        ? `${latestPayslip.month} · ${formatCurrency(latestPayslip.net)}`
        : "No payslip yet",
    },
    {
      label: "Payment Date",
      value: paymentInfo
        ? paymentInfo.adjustedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : salaryDate
          ? new Date(salaryDate).getDate() + "th"
          : "—",
      icon: CalendarClock,
      color: paymentInfo && paymentInfo.absentCount > 0 ? "var(--accent-red)" : "var(--accent-green)",
      sub: paymentInfo && paymentInfo.absentCount > 0
        ? `Shifted +${paymentInfo.absentCount} day${paymentInfo.absentCount !== 1 ? "s" : ""} (absences)`
        : salaryDate ? "No absences — on schedule" : "No salary date set",
    },
    {
      label: "Notices",
      value: String(notices.length),
      icon: CalendarDays,
      color: "var(--accent-blue)",
      sub: notices.length > 0 ? notices[0].title.slice(0, 28) + "…" : "No new notices",
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Dashboard</h1>
          <p className="page-subtitle">Good morning — here&apos;s your day at a glance.</p>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {STATS.map((s) => (
          <div key={s.label} className="card" style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <s.icon size={18} color={s.color} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{s.label}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Clock In/Out Widget */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Attendance — Today</div>
          {empLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Clock In",  value: todayRecord?.clockIn  ? fmt24to12(todayRecord.clockIn)  : "—", color: hasClockedIn  ? "var(--accent-green)" : "var(--text-muted)" },
                { label: "Clock Out", value: todayRecord?.clockOut ? fmt24to12(todayRecord.clockOut) : "—", color: hasClockedOut ? "var(--accent-blue)"  : "var(--text-muted)" },
                { label: "Break Start", value: todayRecord?.breakStart ? fmt24to12(todayRecord.breakStart) : "—", color: todayRecord?.breakStart ? "var(--accent-amber)" : "var(--text-muted)" },
                { label: "Break End",   value: todayRecord?.breakEnd   ? fmt24to12(todayRecord.breakEnd)   : "—", color: todayRecord?.breakEnd   ? "var(--accent-amber)" : "var(--text-muted)" },
              ].map((item) => (
                <div key={item.label} style={{ padding: "12px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
          <button
            className={`btn ${!hasClockedIn ? "btn-primary" : (!hasClockedOut ? "btn-secondary" : "btn-primary")}`}
            style={{ width: "100%", gap: 6 }}
            id="employee-clock-action-btn"
            onClick={handleAction}
            disabled={clocking || empLoading}
          >
            {clocking ? (
              <><Loader2 size={16} className="animate-spin" /> Loading…</>
            ) : !hasClockedIn ? (
              <><Play size={16} /> Clock In</>
            ) : !hasClockedOut ? (
              <><Square size={16} /> Clock Out</>
            ) : (
              <><RefreshCw size={16} /> Continue Work</>
            )}
          </button>
        </div>

        {/* Activity Graph */}
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Weekly Activity (Hours)</div>
          {activityData.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Clock in to see your activity
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                <Area type="monotone" dataKey="hours" stroke="#3B82F6" fill="url(#activityGrad)" strokeWidth={2} activeDot={{ r: 4, fill: "#3B82F6" }} name="Hours Logged" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        {/* Productivity & Login Calendar */}
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={16} color="var(--brand-red)" />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Productivity &amp; Login Calendar</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={prevMonth}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100, textAlign: "center" }}>
                {MONTHS[calendarMonth]} {calendarYear}
              </span>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 8px" }}
                onClick={nextMonth}
                disabled={calendarYear === today.getFullYear() && calendarMonth >= today.getMonth()}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div style={{ marginBottom: 16 }}>
            {/* Day Headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
              {DAYS.map((d) => (
                <div key={d} style={{
                  fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
                  letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center",
                  padding: "8px 0",
                  background: "rgba(255,255,255,0.03)",
                  borderBottom: "2px solid var(--border)",
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
              {calendarCells.map((cellDay, idx) => {
                if (cellDay === null) return (
                  <div key={`empty-${idx}`} style={{
                    minHeight: 48, background: "rgba(255,255,255,0.01)",
                    borderBottom: "1px solid var(--border)",
                  }} />
                );
                
                const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;
                const isSelected = selectedCalendarDate === dateStr;
                const cellDate = new Date(calendarYear, calendarMonth, cellDay);
                const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                const isFuture = cellDate > today;
                const isToday = dateStr === todayStr;
                const isBeforeJoin = joiningDate ? dateStr < joiningDate : false;
                const rec = recordsMap[dateStr];

                let bg = "var(--bg-secondary)";
                let color = "var(--text-primary)";
                let statusLabel = "";
                let statusDotColor = "";
                let title = "No record";

                if (isFuture) {
                  bg = "rgba(255,255,255,0.02)";
                  color = "var(--text-muted)";
                  title = "Future date";
                  statusLabel = "";
                } else if (isBeforeJoin) {
                  bg = "rgba(255,255,255,0.02)";
                  color = "var(--text-muted)";
                  title = "Not joined yet";
                  statusLabel = "";
                } else if (rec) {
                  const hours = parseHours(rec.hoursWorked);
                  const status = rec.status;
                  if (status === "Present" || status === "Late") {
                    if (hours >= 8) {
                      bg = "rgba(30, 158, 85, 0.18)";
                      color = "var(--accent-green)";
                    } else if (hours >= 5) {
                      bg = "rgba(30, 158, 85, 0.10)";
                      color = "var(--accent-green)";
                    } else {
                      bg = "rgba(217, 140, 0, 0.10)";
                      color = "var(--accent-amber)";
                    }
                    title = `${status} (${rec.hoursWorked})`;
                    statusLabel = status;
                    statusDotColor = color;
                  } else if (status === "Half Day") {
                    bg = "rgba(217, 140, 0, 0.10)";
                    color = "var(--accent-amber)";
                    title = `Half Day (${rec.hoursWorked})`;
                    statusLabel = "Half";
                    statusDotColor = color;
                  } else if (status === "Absent") {
                    bg = "rgba(255, 49, 49, 0.10)";
                    color = "var(--accent-red)";
                    title = "Absent";
                    statusLabel = "Absent";
                    statusDotColor = color;
                  } else if (status === "Holiday") {
                    bg = "var(--accent-purple-dim)";
                    color = "var(--accent-purple)";
                    title = "Holiday";
                    statusLabel = "Holiday";
                    statusDotColor = color;
                  }
                } else if (isWeekend) {
                  bg = "rgba(255,255,255,0.02)";
                  color = "var(--text-muted)";
                  title = "Weekend";
                  statusLabel = "";
                } else if (isToday) {
                  bg = "var(--bg-secondary)";
                  color = "var(--text-secondary)";
                  title = "Today (No activity yet)";
                  statusLabel = "Pending";
                } else {
                  bg = "rgba(255, 49, 49, 0.04)";
                  color = "var(--accent-red)";
                  title = "Absent (No activity)";
                  statusLabel = "N/A";
                  statusDotColor = "var(--accent-red)";
                }

                return (
                  <button
                    key={dateStr}
                    title={title}
                    disabled={isFuture}
                    style={{
                      minHeight: 48,
                      padding: "5px 6px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      background: isSelected ? "rgba(255,255,255,0.08)" : bg,
                      color: color,
                      borderBottom: "1px solid var(--border)",
                      borderRight: "1px solid rgba(255,255,255,0.04)",
                      borderTop: "none",
                      borderLeft: isSelected ? "3px solid var(--text-primary)" : isToday ? "3px solid var(--brand-red)" : "3px solid transparent",
                      cursor: isFuture ? "default" : "pointer",
                      transition: "background 0.12s, border-color 0.12s",
                      opacity: isFuture ? 0.65 : 1,
                      borderRadius: 0,
                    }}
                    onClick={() => {
                      if (!isFuture) setSelectedCalendarDate(dateStr);
                    }}
                  >
                    <span style={{
                      fontSize: 12, fontWeight: isToday ? 800 : 600,
                      color: isToday ? "var(--brand-red)" : color,
                      lineHeight: 1,
                    }}>{cellDay}</span>
                    {statusLabel && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: statusDotColor, flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 8, fontWeight: 600, color: statusDotColor,
                          letterSpacing: "0.02em", lineHeight: 1,
                        }}>{statusLabel}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              {[
                { color: "var(--accent-green)", label: "Present" },
                { color: "var(--accent-red)", label: "Absent" },
                { color: "var(--accent-amber)", label: "Half Day" },
                { color: "var(--accent-purple)", label: "Holiday" },
              ].map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-secondary)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, opacity: 0.5, flexShrink: 0 }} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Details Panel */}
          {selectedCalendarDate && (
            <div style={{
              padding: "12px 14px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              marginTop: "auto",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {new Date(selectedCalendarDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    {selectedRecord ? (
                      selectedRecord.status === "Present" || selectedRecord.status === "Late" ? (
                        <>Clocked in at <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedRecord.clockIn ? fmt24to12(selectedRecord.clockIn) : "—"}</span></>
                      ) : (
                        `Status: ${selectedRecord.status}`
                      )
                    ) : (
                      new Date(selectedCalendarDate).getDay() === 0 || new Date(selectedCalendarDate).getDay() === 6 ? "Weekend Rest Day" : "Absent — No log found"
                    )}
                  </div>
                </div>
                {selectedRecord && (
                  <span className="badge" style={{
                    background: selectedRecord.status === "Present" || selectedRecord.status === "Late" ? "var(--accent-green-dim)" : (selectedRecord.status === "Absent" ? "var(--accent-red-dim)" : "var(--accent-amber-dim)"),
                    color: selectedRecord.status === "Present" || selectedRecord.status === "Late" ? "var(--accent-green)" : (selectedRecord.status === "Absent" ? "var(--accent-red)" : "var(--accent-amber)"),
                    border: "none"
                  }}>
                    {selectedRecord.status}
                  </span>
                )}
              </div>

              {/* Productivity metrics */}
              {selectedRecord && (selectedRecord.status === "Present" || selectedRecord.status === "Late") ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                    <span>Productivity Score</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {Math.min(100, Math.round((parseHours(selectedRecord.hoursWorked) / 8) * 100))}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round((parseHours(selectedRecord.hoursWorked) / 8) * 100))}%`,
                      background: parseHours(selectedRecord.hoursWorked) >= 8 ? "var(--accent-green)" : (parseHours(selectedRecord.hoursWorked) >= 5 ? "var(--accent-green)" : "var(--accent-amber)"),
                      borderRadius: 2,
                    }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
                    <div>Hours Worked: <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedRecord.hoursWorked}</span></div>
                    <div>Clock Out: <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedRecord.clockOut ? fmt24to12(selectedRecord.clockOut) : "Active Now"}</span></div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                  {new Date(selectedCalendarDate).getDay() === 0 || new Date(selectedCalendarDate).getDay() === 6 
                    ? "Enjoy your weekend rest!" 
                    : "No work hours logged. Marking productivity as 0%."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Notices */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recent Notices</div>
          {notices.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>No notices yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {notices.map((n) => (
                <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: priorityColor[n.priority] ?? "var(--text-muted)" }}>{n.priority}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 12 }}>{n.createdAt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
