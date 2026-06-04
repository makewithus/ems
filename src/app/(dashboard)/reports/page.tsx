"use client";
import { useState } from "react";
import { Download, BarChart3, FileText, Users, Calendar, DollarSign, FolderOpen } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const REPORT_TYPES = [
  { id: "attendance", label: "Attendance Report",  icon: Calendar,   color: "var(--accent-blue)"   },
  { id: "leave",      label: "Leave Report",        icon: Calendar,   color: "var(--accent-amber)"  },
  { id: "payroll",    label: "Payroll Report",      icon: DollarSign, color: "var(--accent-purple)" },
  { id: "employee",   label: "Employee Report",     icon: Users,      color: "var(--accent-green)"  },
  { id: "department", label: "Department Report",   icon: BarChart3,  color: "var(--accent-red)"    },
  { id: "document",   label: "Document Report",     icon: FolderOpen, color: "var(--accent-blue)"   },
];

const attendanceTrend = [
  { month: "Jan", present: 88, absent: 8, late: 4 },
  { month: "Feb", present: 85, absent: 10, late: 5 },
  { month: "Mar", present: 90, absent: 6, late: 4 },
  { month: "Apr", present: 87, absent: 9, late: 4 },
  { month: "May", present: 92, absent: 5, late: 3 },
];

const payrollTrend = [
  { month: "Jan", total: 1520000 },
  { month: "Feb", total: 1540000 },
  { month: "Mar", total: 1580000 },
  { month: "Apr", total: 1610000 },
  { month: "May", total: 1840000 },
];

const leaveTrend = [
  { month: "Jan", casual: 18, medical: 12, emergency: 5 },
  { month: "Feb", casual: 14, medical: 15, emergency: 3 },
  { month: "Mar", casual: 20, medical: 10, emergency: 7 },
  { month: "Apr", casual: 16, medical: 18, emergency: 4 },
  { month: "May", casual: 22, medical: 14, emergency: 6 },
];

const tooltipStyle = {
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};

export default function ReportsPage() {
  const [active, setActive] = useState("attendance");
  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo]   = useState("2025-05-31");

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Analyse trends and export data across all modules</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button id="report-export-csv"   className="btn btn-secondary" style={{ gap: 6, fontSize: 13 }}><Download size={13} /> CSV</button>
          <button id="report-export-excel" className="btn btn-secondary" style={{ gap: 6, fontSize: 13 }}><Download size={13} /> Excel</button>
          <button id="report-export-pdf"   className="btn btn-primary"   style={{ gap: 6, fontSize: 13 }}><FileText  size={13} /> PDF</button>
        </div>
      </div>

      {/* Report type selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 24 }}>
        {REPORT_TYPES.map((r) => (
          <button key={r.id} onClick={() => setActive(r.id)} style={{
            padding: "12px 10px", borderRadius: "var(--radius-sm)", border: `1px solid ${active === r.id ? r.color : "var(--border)"}`,
            background: active === r.id ? `${r.color}14` : "var(--bg-secondary)", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s",
          }}>
            <r.icon size={18} color={active === r.id ? r.color : "var(--text-muted)"} />
            <span style={{ fontSize: 11, fontWeight: active === r.id ? 600 : 400, color: active === r.id ? r.color : "var(--text-secondary)", textAlign: "center", lineHeight: 1.3 }}>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>From</label>
          <input id="report-from" type="date" className="input-base" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>To</label>
          <input id="report-to" type="date" className="input-base" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} />
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 13 }}>Apply Filter</button>
      </div>

      {/* Charts */}
      {active === "attendance" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: "20px 20px 12px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Monthly Attendance Trend (%)</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={attendanceTrend}>
                <defs>
                  <linearGradient id="presGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="present" stroke="#3B82F6" fill="url(#presGrad)" strokeWidth={2} name="Present %" />
                <Area type="monotone" dataKey="absent"  stroke="#EF4444" fill="none"           strokeWidth={2} strokeDasharray="4 2" name="Absent %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="card" style={{ padding: "20px 20px 12px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Attendance Breakdown</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={attendanceTrend} barSize={12} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="present" fill="#3B82F6" radius={[3,3,0,0]} name="Present" />
                <Bar dataKey="absent"  fill="#EF4444" radius={[3,3,0,0]} name="Absent" />
                <Bar dataKey="late"    fill="#F59E0B" radius={[3,3,0,0]} name="Late" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card" style={{ padding: "18px 20px", gridColumn: "1/-1" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Summary Statistics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
              {[
                { label: "Avg Attendance", value: "88.4%",  color: "var(--accent-blue)"  },
                { label: "Total Present",  value: "2,140",  color: "var(--accent-green)" },
                { label: "Total Absent",   value: "190",    color: "var(--accent-red)"   },
                { label: "Total Late",     value: "84",     color: "var(--accent-amber)" },
                { label: "Working Days",   value: "110",    color: "var(--text-primary)" },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", padding: "12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {active === "payroll" && (
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Monthly Payroll Disbursement (₹)</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={payrollTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `₹${(v/100000).toFixed(1)}L`} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${(v/100000).toFixed(2)}L`, "Total Payroll"]} />
              <Line type="monotone" dataKey="total" stroke="#A855F7" strokeWidth={2.5} dot={{ r: 4, fill: "#A855F7" }} name="Payroll" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {active === "leave" && (
        <div className="card" style={{ padding: "20px 20px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Leave Trends by Type</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={leaveTrend} barSize={12} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="casual"    fill="#3B82F6" radius={[3,3,0,0]} name="Casual" />
              <Bar dataKey="medical"   fill="#22C55E" radius={[3,3,0,0]} name="Medical" />
              <Bar dataKey="emergency" fill="#EF4444" radius={[3,3,0,0]} name="Emergency" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(active === "employee" || active === "department" || active === "document") && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          <BarChart3 size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>Connect Firebase to load live {active} report data.</p>
        </div>
      )}
    </div>
  );
}
