"use client";
import { Clock, CalendarDays, DollarSign, Flame, Check, Play, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { useAttendanceStore } from "@/store/attendance.store";

const STATS = [
  { label: "Today's Status", value: "Present", icon: Clock, color: "var(--accent-green)", sub: "Clocked in at 9:04 AM" },
  { label: "Login Streak", value: "14 Days", icon: Flame, color: "var(--accent-amber)", sub: "Keep it up! 🔥" },
  { label: "Leave Balance", value: "14 days", icon: CalendarDays, color: "var(--accent-blue)", sub: "Casual: 6 · Medical: 5 · Paid: 3" },
  { label: "Salary Status", value: "Credited", icon: DollarSign, color: "var(--accent-purple)", sub: "May 2025 · ₹58,400" },
];

const activityData = [
  { day: "Mon", hours: 8.5 },
  { day: "Tue", hours: 9.1 },
  { day: "Wed", hours: 8.8 },
  { day: "Thu", hours: 9.5 },
  { day: "Fri", hours: 8.2 },
];

const recentNotices = [
  { title: "Office closure — May 30", priority: "Urgent", date: "May 22" },
  { title: "Q2 appraisal cycle starting June", priority: "Normal", date: "May 20" },
  { title: "Updated leave policy FY2025", priority: "Low", date: "May 18" },
];

const priorityColor: Record<string, string> = {
  Urgent: "var(--accent-red)",
  Normal: "var(--accent-blue)",
  Low:    "var(--text-muted)",
};

const tooltipStyle = {
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};

export default function EmployeeDashboard() {
  const { clockInTime, clockOutTime, clockIn, clockOut, continueWork } = useAttendanceStore();

  const handleAction = () => {
    if (!clockInTime) {
      clockIn();
      toast.success("Clocked in successfully!");
    } else if (!clockOutTime) {
      clockOut();
      toast.success("Clocked out successfully!");
    } else {
      continueWork();
      toast.success("Resumed working!");
    }
  };

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s.icon size={18} color={s.color} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Clock In/Out Widget */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Attendance — Today</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Clock In",    value: clockInTime || "—", color: clockInTime ? "var(--accent-green)" : "var(--text-muted)" },
              { label: "Clock Out",   value: clockOutTime || "—", color: clockOutTime ? "var(--accent-blue)" : "var(--text-muted)" },
              { label: "Break Start", value: "01:00 PM", color: "var(--accent-amber)" },
              { label: "Break End",   value: "01:45 PM", color: "var(--accent-amber)" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "12px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
          <button 
            className={`btn ${!clockInTime ? "btn-primary" : (!clockOutTime ? "btn-secondary" : "btn-primary")}`} 
            style={{ width: "100%", gap: 6 }} 
            id="employee-clock-action-btn"
            onClick={handleAction}
          >
            {!clockInTime ? (
              <><Play size={16} /> Clock In</>
            ) : !clockOutTime ? (
              <><Check size={16} /> Clock Out</>
            ) : (
              <><RefreshCw size={16} /> Continue Work</>
            )}
          </button>
        </div>

        {/* Activity Graph */}
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Weekly Activity (Hours)</div>
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
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {/* Recent Notices */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recent Notices</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentNotices.map((n, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: priorityColor[n.priority] }}>{n.priority}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 12 }}>{n.date}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
