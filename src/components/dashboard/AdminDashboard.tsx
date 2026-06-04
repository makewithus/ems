"use client";
import { useState, useEffect } from "react";
import {
  Users, Clock, UserX, CalendarDays, DollarSign,
  FolderOpen, Cake, Megaphone, TrendingUp, TrendingDown,
  Check, X, Loader2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  collection, onSnapshot, query, orderBy, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

/* ─── Static chart data ─── */
const attendanceData = [
  { day: "Mon", present: 42, absent: 8, late: 5 },
  { day: "Tue", present: 45, absent: 5, late: 3 },
  { day: "Wed", present: 48, absent: 4, late: 2 },
  { day: "Thu", present: 44, absent: 7, late: 4 },
  { day: "Fri", present: 50, absent: 2, late: 1 },
  { day: "Sat", present: 12, absent: 40, late: 0 },
];

const leaveTypeData = [
  { name: "Casual",    value: 24, color: "var(--text-primary)" },
  { name: "Medical",   value: 18, color: "var(--brand-red)" },
  { name: "Emergency", value: 8,  color: "#d98c00" },
  { name: "Paid",      value: 14, color: "var(--text-secondary)" },
  { name: "Unpaid",    value: 6,  color: "var(--text-muted)" },
];

const growthData = [
  { month: "Jan", employees: 38 },
  { month: "Feb", employees: 40 },
  { month: "Mar", employees: 43 },
  { month: "Apr", employees: 45 },
  { month: "May", employees: 50 },
  { month: "Jun", employees: 58 },
];

const tooltipStyle = {
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};

/* ─── Fallback leave requests shown before Firestore loads ─── */
const FALLBACK_LEAVES = [
  { id: "fl1", name: "Arjun Mehta",    type: "Medical",   days: "3 days",  date: "May 23–25", status: "Pending" },
  { id: "fl2", name: "Priya Sharma",   type: "Casual",    days: "1 day",   date: "May 24",    status: "Pending" },
  { id: "fl3", name: "Rahul Gupta",    type: "Emergency", days: "2 days",  date: "May 22–23", status: "Pending" },
  { id: "fl4", name: "Sneha Patel",    type: "Paid",      days: "5 days",  date: "May 26–30", status: "Pending" },
];

type LeaveRequest = {
  id: string;
  name: string;
  type: string;
  days: string;
  date: string;
  status: string;
  isMock?: boolean;
};

export default function AdminDashboard() {
  const { profile } = useAuthStore();

  /* ─── Live state ─── */
  const [employeeCount, setEmployeeCount] = useState(58);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [departmentData, setDepartmentData] = useState([
    { name: "Engineering", count: 18 },
    { name: "Sales", count: 12 },
    { name: "HR", count: 6 },
    { name: "Finance", count: 8 },
    { name: "Design", count: 5 },
    { name: "Ops", count: 9 },
  ]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  /* ── Real-time employees count ── */
  useEffect(() => {
    let unsub = () => {};
    const t = setTimeout(() => {
      const q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            setEmployeeCount(snap.size);
            // Compute department breakdown dynamically
            const deptMap: Record<string, number> = {};
            snap.docs.forEach((d) => {
              const dept = d.data().department || "Other";
              deptMap[dept] = (deptMap[dept] || 0) + 1;
            });
            const deptArr = Object.entries(deptMap).map(([name, count]) => ({ name, count }));
            if (deptArr.length > 0) setDepartmentData(deptArr);
          }
        },
        () => {} // silently ignore errors, use defaults
      );
    }, 10);
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  /* ── Real-time pending leave requests ── */
  useEffect(() => {
    let unsub = () => {};
    const t = setTimeout(() => {
      const q = query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          const rows: LeaveRequest[] = snap.docs
            .map((d) => {
              const data = d.data();
              const start = data.startDate ?? "";
              const end   = data.endDate   ?? "";
              const fmt = (s: string) =>
                s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
              return {
                id:     d.id,
                name:   data.employeeName ?? "Employee",
                type:   data.leaveType   ?? "",
                days:   `${data.days ?? 1} day${(data.days ?? 1) > 1 ? "s" : ""}`,
                date:   start === end || !end ? fmt(start) : `${fmt(start)}–${fmt(end)}`,
                status: data.status      ?? "Pending",
              };
            })
            .filter((r) => r.status === "Pending");

          // If Firestore is empty, show fallback mock data
          setPendingLeaves(rows.length > 0 ? rows : FALLBACK_LEAVES);
          setLoadingLeaves(false);
        },
        () => {
          setPendingLeaves(FALLBACK_LEAVES);
          setLoadingLeaves(false);
        }
      );
    }, 10);
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  /* ── Approve / Reject ── */
  const handleLeaveAction = async (id: string, action: "Approved" | "Rejected", isMock?: boolean) => {
    setProcessingId(id);
    if (isMock) {
      // For mock data just update local state
      setTimeout(() => {
        setPendingLeaves((prev) => prev.filter((r) => r.id !== id));
        toast.success(`Leave request ${action.toLowerCase()} successfully!`);
        setProcessingId(null);
      }, 600);
      return;
    }
    try {
      await updateDoc(doc(db, "leaveRequests", id), {
        status:     action,
        reviewedBy: profile?.displayName ?? "Admin",
        reviewedAt: serverTimestamp(),
        updatedAt:  serverTimestamp(),
      });
      toast.success(`Leave request ${action.toLowerCase()} successfully!`);
    } catch {
      toast.error("Failed to update leave request.");
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = pendingLeaves.length;

  const STATS = [
    { label: "Total Employees",      value: String(employeeCount), icon: Users,       color: "var(--accent-blue)",   delta: "+3 this month",    up: true  },
    { label: "Present Today",        value: String(Math.round(employeeCount * 0.86)), icon: Clock, color: "var(--accent-green)",  delta: "86% attendance",   up: true  },
    { label: "Absent Today",         value: String(Math.round(employeeCount * 0.14)), icon: UserX, color: "var(--accent-red)",    delta: "↓ 2 from yesterday",up: false },
    { label: "Pending Leaves",       value: String(pendingCount),  icon: CalendarDays, color: "var(--accent-amber)",  delta: `${Math.min(pendingCount,4)} urgent`, up: false },
    { label: "Payroll Generated",    value: "₹18.4L",              icon: DollarSign,  color: "var(--accent-purple)", delta: "May 2025",         up: true  },
    { label: "Documents",            value: "247",                  icon: FolderOpen,  color: "var(--accent-blue)",   delta: "+14 this week",    up: true  },
    { label: "Birthdays This Week",  value: "3",                    icon: Cake,        color: "var(--accent-amber)",  delta: "Send wishes!",     up: true  },
    { label: "New Notices",          value: "5",                    icon: Megaphone,   color: "var(--accent-red)",    delta: "2 unread",         up: false },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back — here&apos;s what&apos;s happening today.</p>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {STATS.map((s) => (
          <div key={s.label} className="card" style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s.icon size={18} color={s.color} />
              </div>
              {s.up ? <TrendingUp size={14} color="var(--accent-green)" /> : <TrendingDown size={14} color="var(--accent-red)" />}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.delta}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Attendance Trend */}
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Weekly Attendance</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attendanceData} barSize={10} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--bg-secondary)" }} />
              <Bar dataKey="present" fill="var(--text-primary)" radius={[0, 0, 0, 0]} name="Present" />
              <Bar dataKey="absent"  fill="var(--brand-red)" radius={[0, 0, 0, 0]} name="Absent" />
              <Bar dataKey="late"    fill="var(--text-muted)" radius={[0, 0, 0, 0]} name="Late" />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Employee Growth */}
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Employee Growth</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={growthData}>
              <defs>
                <linearGradient id="empGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-strong)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="employees" stroke="var(--text-primary)" fill="transparent" strokeWidth={2} dot={{ r: 3, fill: "var(--text-primary)" }} name="Employees" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Dept breakdown — live */}
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Employees by Department</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={departmentData} layout="vertical" barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--bg-secondary)" }} />
              <Bar dataKey="count" fill="var(--text-primary)" radius={[0, 0, 0, 0]} name="Employees" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leave Pie */}
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Leave Distribution</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={leaveTypeData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={3}>
                {leaveTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {leaveTypeData.map((d) => (
              <div key={d.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                  {d.name}
                </div>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pending Leave Requests — Live */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Pending Leave Requests
            {pendingCount > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, background: "var(--accent-amber)", color: "#fff", borderRadius: 99, padding: "2px 8px" }}>
                {pendingCount}
              </span>
            )}
          </div>
          {loadingLeaves && <Loader2 size={14} className="animate-spin" color="var(--text-muted)" />}
        </div>

        {loadingLeaves ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 10, color: "var(--text-muted)" }}>
            <Loader2 size={18} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Loading requests…</span>
          </div>
        ) : pendingLeaves.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
            ✅ No pending leave requests
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {pendingLeaves.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: "var(--radius-sm)",
                  background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                  opacity: processingId === r.id ? 0.5 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-blue-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "var(--accent-blue)" }}>
                    {r.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.type} · {r.date} · {r.days}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "5px 12px", fontSize: 12, gap: 4 }}
                    disabled={processingId === r.id}
                    onClick={() => handleLeaveAction(r.id, "Approved", r.isMock)}
                  >
                    {processingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "5px 12px", fontSize: 12, gap: 4 }}
                    disabled={processingId === r.id}
                    onClick={() => handleLeaveAction(r.id, "Rejected", r.isMock)}
                  >
                    {processingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
