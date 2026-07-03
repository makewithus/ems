"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2,
  XCircle, Clock, AlertCircle, X, Save, Loader2,
  CalendarDays, PenLine, RotateCcw, Search,
  UserCheck, ListChecks, Pencil,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import {
  useEmployeeAttendance,
  manualMarkAttendance,
  AttendanceRecord,
} from "@/hooks/useAttendance";

/* ─── Types ─── */
type EmpOption = { id: string; employeeId: string; name: string; department: string };
type StatusType = "Present" | "Absent" | "Late" | "Half Day" | "Holiday";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const STATUS_OPTIONS: { value: StatusType; label: string; color: string; bg: string }[] = [
  { value: "Present",  label: "Present",  color: "var(--accent-green)",  bg: "var(--accent-green-dim)"  },
  { value: "Absent",   label: "Absent",   color: "var(--accent-red)",    bg: "var(--accent-red-dim)"    },
  { value: "Late",     label: "Late",     color: "var(--accent-amber)",  bg: "var(--accent-amber-dim)"  },
  { value: "Half Day", label: "Half Day", color: "var(--accent-purple)", bg: "var(--accent-purple-dim)" },
  { value: "Holiday",  label: "Holiday",  color: "var(--accent-blue)",   bg: "var(--accent-blue-dim)"   },
];

function getDayStyle(status: string | undefined, isWeekend: boolean, isFuture: boolean) {
  if (isFuture)  return { bg: "transparent", color: "rgba(255,255,255,0.2)", border: "1px dashed rgba(255,255,255,0.08)" };
  if (!status) {
    if (isWeekend) return { bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" };
    // Not marked — clearly visible grey
    return { bg: "rgba(148,163,184,0.18)", color: "rgba(203,213,225,0.75)", border: "1px solid rgba(148,163,184,0.35)" };
  }
  switch (status) {
    case "Present":
      return { bg: "rgba(34,197,94,0.28)",  color: "#4ade80", border: "1px solid rgba(34,197,94,0.6)"   };
    case "Late":
      return { bg: "rgba(34,197,94,0.18)",  color: "#86efac", border: "1px solid rgba(34,197,94,0.4)"   };
    case "Absent":
      return { bg: "rgba(239,68,68,0.28)",  color: "#f87171", border: "1px solid rgba(239,68,68,0.6)"   };
    case "Half Day":
      return { bg: "rgba(168,85,247,0.28)", color: "#d8b4fe", border: "1px solid rgba(168,85,247,0.6)"  };
    case "Holiday":
      return { bg: "rgba(59,130,246,0.28)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.6)"  };
    default:
      return { bg: "rgba(148,163,184,0.18)", color: "rgba(203,213,225,0.75)", border: "1px solid rgba(148,163,184,0.3)" };
  }
}

/* ─── Mark Dialog ─── */
function MarkDialog({
  date, existing, emp, onClose, onSaved,
}: {
  date: string;
  existing?: AttendanceRecord;
  emp: EmpOption;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<StatusType>(existing?.status as StatusType ?? "Present");
  const [notes, setNotes]   = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await manualMarkAttendance(emp.employeeId, emp.name, emp.department, date, status, notes);
      toast.success(`${emp.name} marked as ${status} on ${date}`);
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!existing;

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:600 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding:0, width:420, overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--bg-secondary)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:8, background:"var(--accent-blue-dim)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Pencil size={16} color="var(--accent-blue)" />
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>{isEdit ? "Edit Attendance" : "Mark Attendance"}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>
                {emp.name} &middot; {new Date(date).toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"numeric" })}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding:"4px 8px" }} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Current status banner if editing */}
        {isEdit && (
          <div style={{ padding:"10px 20px", background:"rgba(59,130,246,0.06)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
            <span style={{ color:"var(--text-muted)" }}>Current status:</span>
            <span style={{
              padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700,
              background: STATUS_OPTIONS.find(s => s.value === existing.status)?.bg ?? "var(--bg-elevated)",
              color: STATUS_OPTIONS.find(s => s.value === existing.status)?.color ?? "var(--text-secondary)",
            }}>
              {existing.status}
            </span>
            <span style={{ color:"var(--text-muted)", fontSize:11, marginLeft:"auto" }}>
              {existing.manuallyMarked ? "✏️ Manually marked" : "🔒 Employee self-marked"}
            </span>
          </div>
        )}

        <div style={{ padding:20 }}>
          {/* Status picker */}
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--text-muted)", marginBottom:10 }}>
            {isEdit ? "Change Status To" : "Select Status"}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                style={{
                  padding:"10px 14px", borderRadius:"var(--radius-sm)", cursor:"pointer",
                  border: status === s.value ? `2px solid ${s.color}` : "2px solid var(--border)",
                  background: status === s.value ? s.bg : "var(--bg-elevated)",
                  color: status === s.value ? s.color : "var(--text-secondary)",
                  fontWeight: status === s.value ? 700 : 500,
                  fontSize:13, transition:"all 0.15s",
                  display:"flex", alignItems:"center", gap:6,
                }}
              >
                <span style={{ width:8, height:8, borderRadius:"50%", background:s.color, flexShrink:0 }} />
                {s.label}
                {status === s.value && <span style={{ marginLeft:"auto", fontSize:10 }}>✓</span>}
              </button>
            ))}
          </div>

          {/* Notes */}
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--text-muted)", marginBottom:6 }}>Notes (optional)</div>
          <textarea
            className="input-base"
            style={{ width:"100%", minHeight:68, resize:"vertical", fontSize:13 }}
            placeholder="Add a note for this record…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button className="btn btn-primary" style={{ flex:1, gap:6 }} onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Mark Attendance"}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Stats strip ─── */
function StatsStrip({ records, year, month }: { records: AttendanceRecord[]; year: number; month: number }) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthRecs = records.filter((r) => r.date.startsWith(prefix));

  const present  = monthRecs.filter((r) => r.status === "Present" || r.status === "Late").length;
  const absent   = monthRecs.filter((r) => r.status === "Absent").length;
  const late     = monthRecs.filter((r) => r.status === "Late").length;
  const halfDay  = monthRecs.filter((r) => r.status === "Half Day").length;
  const holiday  = monthRecs.filter((r) => r.status === "Holiday").length;

  const stats = [
    { icon: CheckCircle2, label:"Present",  value: present,  color:"var(--accent-green)",  bg:"var(--accent-green-dim)"  },
    { icon: XCircle,      label:"Absent",   value: absent,   color:"var(--accent-red)",    bg:"var(--accent-red-dim)"    },
    { icon: Clock,        label:"Late",     value: late,     color:"var(--accent-amber)",  bg:"var(--accent-amber-dim)"  },
    { icon: AlertCircle,  label:"Half Day", value: halfDay,  color:"var(--accent-purple)", bg:"var(--accent-purple-dim)" },
    { icon: CalendarDays, label:"Holiday",  value: holiday,  color:"var(--accent-blue)",   bg:"var(--accent-blue-dim)"   },
  ];

  return (
    <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:"var(--radius-sm)", background:s.bg, border:`1px solid ${s.color}30`, flex:"1 1 80px", minWidth:80 }}>
          <s.icon size={16} color={s.color} />
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:10, color:s.color, opacity:0.8, fontWeight:600, marginTop:2 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Calendar grid (interactive for admin) ─── */
function InteractiveCalendar({
  year, month, records, emp, onRefresh,
}: {
  year: number; month: number;
  records: AttendanceRecord[];
  emp: EmpOption;
  onRefresh: () => void;
}) {
  const [markTarget, setMarkTarget] = useState<{ date: string; existing?: AttendanceRecord } | null>(null);

  // Optimistic local overrides — cell color updates instantly, Firestore saves in bg
  const [optimistic, setOptimistic]   = useState<Record<string, "Present" | "Absent">>({});
  const [errored,    setErrored]      = useState<Record<string, boolean>>({});

  // Double-tap detection per date
  const clickTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const today    = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const statusMap = useMemo(() => {
    const m: Record<string, AttendanceRecord> = {};
    records.forEach((r) => { if (r.date) m[r.date] = r; });
    return m;
  }, [records]);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  /**
   * Save to Firestore in the background.
   * Optimistic state is set BEFORE this is called, so the UI is already updated.
   * On failure: revert optimistic state + toast error.
   */
  const saveInBackground = async (
    dateStr: string,
    status: "Present" | "Absent",
    prevStatus: string | undefined
  ) => {
    try {
      await manualMarkAttendance(
        emp.employeeId, emp.name, emp.department,
        dateStr, status, `Quick-marked ${status}`
      );
      // Clear optimistic override — real record from onSnapshot takes over
      setOptimistic(prev => { const n = { ...prev }; delete n[dateStr]; return n; });
      setErrored(prev   => { const n = { ...prev }; delete n[dateStr]; return n; });
      onRefresh();
    } catch {
      // Revert optimistic state
      setOptimistic(prev => {
        const n = { ...prev };
        if (prevStatus === "Present" || prevStatus === "Absent") {
          n[dateStr] = prevStatus as "Present" | "Absent";
        } else {
          delete n[dateStr];
        }
        return n;
      });
      setErrored(prev => ({ ...prev, [dateStr]: true }));
      toast.error("Failed to save — please try again");
      setTimeout(() => setErrored(prev => { const n = { ...prev }; delete n[dateStr]; return n; }), 1500);
    }
  };

  /**
   * Single tap  → Present (green) — instant color, background save
   * Double tap  → Absent  (red)   — instant color, background save
   * 220ms window between the two taps.
   */
  const handleTap = (dateStr: string) => {
    const prevStatus = optimistic[dateStr] ?? statusMap[dateStr]?.status;

    if (clickTimerRef.current[dateStr]) {
      // ── DOUBLE TAP ──
      clearTimeout(clickTimerRef.current[dateStr]);
      delete clickTimerRef.current[dateStr];
      setOptimistic(prev => ({ ...prev, [dateStr]: "Absent" }));
      saveInBackground(dateStr, "Absent", prevStatus);
    } else {
      // ── FIRST TAP: optimistic green immediately ──
      setOptimistic(prev => ({ ...prev, [dateStr]: "Present" }));

      clickTimerRef.current[dateStr] = setTimeout(() => {
        delete clickTimerRef.current[dateStr];
        // Still Present — save to Firestore
        saveInBackground(dateStr, "Present", prevStatus);
      }, 220);
    }
  };

  /** Open full edit dialog from pencil corner button */
  const openEdit = (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation();
    if (clickTimerRef.current[dateStr]) {
      clearTimeout(clickTimerRef.current[dateStr]);
      delete clickTimerRef.current[dateStr];
      // Revert optimistic if we cancel the tap
      setOptimistic(prev => { const n = { ...prev }; delete n[dateStr]; return n; });
    }
    const existing = statusMap[dateStr];
    setMarkTarget({ date: dateStr, existing });
  };

  return (
    <>
      {markTarget && (
        <MarkDialog
          date={markTarget.date}
          existing={markTarget.existing}
          emp={emp}
          onClose={() => setMarkTarget(null)}
          onSaved={onRefresh}
        />
      )}

      {/* Tap hint bar */}
      <div style={{ display:"flex", gap:12, alignItems:"center", padding:"8px 12px", marginBottom:10, borderRadius:"var(--radius-sm)", background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", fontSize:11, color:"var(--text-muted)", flexWrap:"wrap" }}>
        <span style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ width:10, height:10, borderRadius:"50%", background:"#4ade80", flexShrink:0 }} />
          <strong style={{ color:"var(--text-secondary)" }}>Single tap</strong> → Present
        </span>
        <span style={{ opacity:0.4 }}>|</span>
        <span style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ width:10, height:10, borderRadius:"50%", background:"#f87171", flexShrink:0 }} />
          <strong style={{ color:"var(--text-secondary)" }}>Double tap</strong> → Absent
        </span>
        <span style={{ opacity:0.4 }}>|</span>
        <span style={{ display:"flex", alignItems:"center", gap:5 }}>
          <Pencil size={9} />
          <strong style={{ color:"var(--text-secondary)" }}>Pencil</strong> → Edit
        </span>
      </div>

      {/* Day headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2, marginBottom:3 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ textAlign:"center", fontSize:9, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.03em", padding:"2px 0" }}>{d.slice(0,1)}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const dateStr   = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday   = dateStr === todayStr;
          const isFuture  = dateStr > todayStr;
          const cellDate  = new Date(year, month, day);
          const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
          const rec       = statusMap[dateStr];
          const isErr     = !!errored[dateStr];

          // Use optimistic status for instant visual, fall back to real record
          const displayStatus = optimistic[dateStr] ?? rec?.status;
          const sty = getDayStyle(
            isErr ? undefined : displayStatus,   // red shake: show as unmarked briefly
            isWeekend,
            isFuture
          );

          return (
            <div
              key={dateStr}
              onClick={() => !isFuture && handleTap(dateStr)}
              title={
                isFuture ? "Future date"
                : isWeekend ? "Weekend — tap to mark"
                : displayStatus
                ? `${displayStatus} — tap: Present · double-tap: Absent · pencil: edit`
                : "Tap: Present · Double-tap: Absent"
              }
              style={{
                aspectRatio:"1", borderRadius:5,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, fontWeight: isToday ? 800 : 500,
                background: sty.bg, color: sty.color,
                border: isErr
                  ? "2px solid var(--accent-red)"
                  : isToday ? `2px solid var(--accent-blue)` : sty.border,
                cursor: isFuture ? "default" : "pointer",
                // Fast transition for the instant color flip
                transition:"background 0.1s, color 0.1s, border-color 0.1s, transform 0.1s",
                position:"relative", userSelect:"none", overflow:"hidden",
              }}
              onMouseEnter={(e) => {
                if (!isFuture) {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "scale(1.13)";
                  const icon = el.querySelector(".edit-hint") as HTMLElement | null;
                  if (icon) icon.style.opacity = "1";
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "scale(1)";
                const icon = el.querySelector(".edit-hint") as HTMLElement | null;
                if (icon) icon.style.opacity = "0";
              }}
            >
              {day}

              {/* Pencil — small corner button */}
              {!isFuture && (
                <span
                  className="edit-hint"
                  onClick={(e) => openEdit(e, dateStr)}
                  title="Edit / change status"
                  style={{
                    position:"absolute", top:2, left:2,
                    width:14, height:14, borderRadius:3,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    background:"rgba(0,0,0,0.55)",
                    opacity:0, transition:"opacity 0.15s",
                    cursor:"pointer", zIndex:2,
                  }}
                >
                  <Pencil size={7} color="#fff" />
                </span>
              )}

              {/* Blue dot = manually marked */}
              {(rec?.manuallyMarked || optimistic[dateStr]) && (
                <div style={{ position:"absolute", top:1, right:2, width:4, height:4, borderRadius:"50%", background:"var(--accent-blue)", zIndex:1 }} />
              )}
            </div>
          );
        })}
      </div>


      {/* Legend */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10, padding:"8px 0", borderTop:"1px solid var(--border)" }}>
        {[
          { bg:"rgba(34,197,94,0.28)",   color:"#4ade80",               label:"Present"  },
          { bg:"rgba(34,197,94,0.18)",   color:"#86efac",               label:"Late"     },
          { bg:"rgba(239,68,68,0.28)",   color:"#f87171",               label:"Absent"   },
          { bg:"rgba(168,85,247,0.28)",  color:"#d8b4fe",               label:"Half Day" },
          { bg:"rgba(59,130,246,0.28)",  color:"#93c5fd",               label:"Holiday"  },
          { bg:"rgba(148,163,184,0.18)", color:"rgba(203,213,225,0.75)",label:"N/A"      },
        ].map((l) => (
          <div key={l.label} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--text-secondary)" }}>
            <div style={{ width:12, height:12, borderRadius:3, background:l.bg, border:`1px solid ${l.color}60`, flexShrink:0 }} />
            <span style={{ color:l.color, fontWeight:600 }}>{l.label}</span>
          </div>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--text-secondary)", marginLeft:"auto" }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--accent-blue)" }} />
          <span>Manual</span>
        </div>
      </div>
    </>
  );
}

/* ─── Bulk Register Modal ─── */
function BulkRegisterModal({ employees, onClose }: { employees: EmpOption[]; onClose: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<StatusType>("Present");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.department.toLowerCase().includes(search.toLowerCase()));
  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(e => e.employeeId)));
  const toggle = (id: string) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };

  const save = async () => {
    if (!selected.size) { toast.error("Select at least one employee"); return; }
    setSaving(true);
    try {
      const targets = employees.filter(e => selected.has(e.employeeId));
      await Promise.all(targets.map(e => manualMarkAttendance(e.employeeId, e.name, e.department, date, status, "Bulk registered")));
      toast.success(`Marked ${targets.length} employee(s) as ${status} on ${date}`);
      onClose();
    } catch { toast.error("Bulk register failed"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:700 }} onClick={onClose}>
      <div className="card" style={{ padding:0, width:480, maxHeight:"88vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--bg-secondary)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <ListChecks size={16} color="var(--accent-green)" />
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>Bulk Register Attendance</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>Select employees, date and status</div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding:"4px 8px" }} onClick={onClose}><X size={15} /></button>
        </div>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", color:"var(--text-muted)", marginBottom:5 }}>Date</div>
              <input type="date" className="input-base" value={date} onChange={e => setDate(e.target.value)} style={{ width:"100%" }} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", color:"var(--text-muted)", marginBottom:5 }}>Status</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => setStatus(s.value)} style={{ padding:"5px 10px", borderRadius:99, fontSize:11, cursor:"pointer", fontWeight:600, border: status===s.value?`2px solid ${s.color}`:`1px solid var(--border)`, background: status===s.value?s.bg:"var(--bg-elevated)", color: status===s.value?s.color:"var(--text-secondary)", display:"flex", alignItems:"center", gap:4, transition:"all 0.12s" }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:s.color, flexShrink:0 }} />{s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ position:"relative" }}>
            <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
            <input className="input-base" style={{ paddingLeft:30, fontSize:12 }} placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          <div style={{ padding:"8px 20px 4px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:11, color:"var(--text-muted)" }}>{selected.size} of {filtered.length} selected</div>
            <button className="btn btn-ghost" style={{ fontSize:11, padding:"3px 8px" }} onClick={toggleAll}>{selected.size === filtered.length ? "Deselect All" : "Select All"}</button>
          </div>
          {filtered.map(emp => (
            <div key={emp.id} onClick={() => toggle(emp.employeeId)} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 20px", cursor:"pointer", background: selected.has(emp.employeeId)?"var(--accent-blue-dim)":"transparent", transition:"background 0.12s", borderBottom:"1px solid var(--border)" }}>
              <div style={{ width:18, height:18, borderRadius:4, border: selected.has(emp.employeeId)?"2px solid var(--accent-blue)":"2px solid var(--border)", background: selected.has(emp.employeeId)?"var(--accent-blue)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {selected.has(emp.employeeId) && <div style={{ width:8, height:8, borderRadius:2, background:"#fff" }} />}
              </div>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"var(--accent-blue-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"var(--accent-blue)", flexShrink:0 }}>
                {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500 }}>{emp.name}</div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>{emp.employeeId} · {emp.department}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid var(--border)", display:"flex", gap:10, flexShrink:0 }}>
          <button className="btn btn-primary" style={{ flex:1, gap:6 }} onClick={save} disabled={saving||!selected.size}>
            {saving?<Loader2 size={14} className="animate-spin" />:<UserCheck size={14} />}
            {saving?"Saving…":`Register ${selected.size} Employee${selected.size!==1?"s":""}`}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Panel ─── */
export default function ManualAttendancePanel() {
  const [employees, setEmployees]   = useState<EmpOption[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<EmpOption | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBulk, setShowBulk]     = useState(false);
  const [empSearch, setEmpSearch]   = useState("");
  const [filling, setFilling]       = useState(false);

  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  /* fetch employees */
  useEffect(() => {
    const q = query(collection(db, "employees"), orderBy("firstName"));
    const unsub = onSnapshot(q, (snap) => {
      setEmployees(
        snap.docs
          .map((d) => ({
            id: d.id,
            employeeId: d.data().employeeId ?? d.id,
            name: `${d.data().firstName ?? ""} ${d.data().lastName ?? ""}`.trim(),
            department: d.data().department ?? "",
          }))
          .filter((e) => e.name.trim())
      );
      setEmpLoading(false);
    }, () => setEmpLoading(false));
    return () => unsub();
  }, []);

  /* attendance records for selected employee */
  const { records, loading: recLoading } = useEmployeeAttendance(selectedEmp?.employeeId ?? "");
  const filteredEmps = useMemo(() => employees.filter(e =>
    e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.department.toLowerCase().includes(empSearch.toLowerCase())
  ), [employees, empSearch]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (year === today.getFullYear() && month >= today.getMonth()) return;
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const bulkFillMonth = async (fillStatus: StatusType) => {
    // Guard: do not run if any other bulk operation is in progress
    if (!selectedEmp || filling) return;

    // Build the list of unmarked working days BEFORE showing the confirm dialog
    const prefix = `${year}-${String(month+1).padStart(2,"0")}`;
    const dim = new Date(year, month+1, 0).getDate();
    const todayStr = today.toISOString().split("T")[0];
    const sm: Record<string,AttendanceRecord> = {};
    records.forEach(r => { if (r.date) sm[r.date] = r; });
    const toMark: string[] = [];
    for (let d = 1; d <= dim; d++) {
      const ds = `${prefix}-${String(d).padStart(2,"0")}`;
      if (ds > todayStr) break;
      const cd = new Date(year, month, d);
      if (cd.getDay() !== 0 && cd.getDay() !== 6 && !sm[ds]) toMark.push(ds);
    }
    if (!toMark.length) { toast.info("No unmarked days to fill"); return; }

    // Require explicit confirmation — prevents accidental triggers
    const confirmed = window.confirm(
      `This will mark ${toMark.length} unmarked working day(s) in ${MONTHS[month]} ${year} as "${fillStatus}" for ${selectedEmp.name}.\n\nProceed?`
    );
    if (!confirmed) return;

    setFilling(true);
    try {
      await Promise.all(
        toMark.map(date =>
          manualMarkAttendance(
            selectedEmp.employeeId,
            selectedEmp.name,
            selectedEmp.department,
            date,
            fillStatus,
            `Bulk-marked ${fillStatus}`
          )
        )
      );
      toast.success(`Marked ${toMark.length} day(s) as ${fillStatus}`);
      setRefreshKey(k => k + 1);
    } catch { toast.error("Bulk fill failed"); }
    finally { setFilling(false); }
  };



  return (
    <div>
      {showBulk && <BulkRegisterModal employees={employees} onClose={() => setShowBulk(false)} />}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:18, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <PenLine size={18} color="var(--accent-blue)" />
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>Manual Attendance Marking</div>
            <div style={{ fontSize:12, color:"var(--text-muted)" }}>Select an employee, then click any day to mark or overwrite</div>
          </div>
        </div>
        <button className="btn btn-primary" style={{ gap:6, fontSize:12 }} onClick={() => setShowBulk(true)}>
          <ListChecks size={14} /> Bulk Register
        </button>
      </div>

      {/* Employee selector */}
      <div className="card" style={{ padding:16, marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--text-muted)", display:"flex", alignItems:"center", gap:5 }}>
            <Users size={12} /> Select Employee
          </div>
          <div style={{ position:"relative", flex:"0 0 200px" }}>
            <Search size={12} style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
            <input className="input-base" style={{ paddingLeft:26, fontSize:11, padding:"6px 8px 6px 26px" }} placeholder="Search…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
          </div>
        </div>
        {empLoading ? (
          <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--text-muted)", fontSize:13 }}>
            <Loader2 size={14} className="animate-spin" /> Loading employees…
          </div>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {filteredEmps.map((emp) => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                style={{
                  padding:"6px 12px", borderRadius:99, fontSize:11, cursor:"pointer", fontWeight:500,
                  border: selectedEmp?.id === emp.id ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                  background: selectedEmp?.id === emp.id ? "var(--accent-blue-dim)" : "var(--bg-elevated)",
                  color: selectedEmp?.id === emp.id ? "var(--accent-blue)" : "var(--text-secondary)",
                  transition:"all 0.15s", display:"flex", alignItems:"center", gap:5,
                }}
              >
                <span style={{ width:18, height:18, borderRadius:"50%", background: selectedEmp?.id===emp.id?"var(--accent-blue)":"var(--bg-secondary)", color: selectedEmp?.id===emp.id?"#fff":"var(--text-muted)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, flexShrink:0 }}>
                  {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                </span>
                {emp.name}
                <span style={{ fontSize:9, opacity:0.7 }}>· {emp.department}</span>
              </button>
            ))}
            {filteredEmps.length === 0 && <div style={{ fontSize:12, color:"var(--text-muted)" }}>No employees match your search.</div>}
          </div>
        )}
      </div>

      {/* Calendar panel */}
      {selectedEmp ? (
        <div className="card" style={{ padding:16 }}>
          {/* Employee header + bulk fill buttons */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:"var(--accent-blue-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--accent-blue)" }}>
                {selectedEmp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700 }}>{selectedEmp.name}</div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>{selectedEmp.employeeId} · {selectedEmp.department}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize:11, gap:4, padding:"5px 10px" }}
                onClick={() => bulkFillMonth("Present")}
                disabled={filling}
                title="Fill all unmarked working days as Present"
              >
                {filling
                  ? <><Loader2 size={12} className="animate-spin" /> Filling…</>
                  : <><CheckCircle2 size={12} color="#4ade80" /> Fill Present</>
                }
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize:11, gap:4, padding:"5px 10px" }}
                onClick={() => bulkFillMonth("Absent")}
                disabled={filling}
                title="Fill all unmarked working days as Absent"
              >
                {filling
                  ? <><Loader2 size={12} className="animate-spin" /> Filling…</>
                  : <><XCircle size={12} color="#f87171" /> Fill Absent</>
                }
              </button>
            </div>
          </div>

          {/* Stats strip */}
          {recLoading ? (
            <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--text-muted)", fontSize:13, marginBottom:16 }}>
              <Loader2 size={14} className="animate-spin" /> Loading records…
            </div>
          ) : (
            <StatsStrip key={refreshKey} records={records} year={year} month={month} />
          )}

          {/* Month navigation */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, padding:"10px 0", borderTop:"1px solid var(--border)", borderBottom:"1px solid var(--border)" }}>
            <button className="btn btn-ghost" style={{ padding:"6px 10px" }} onClick={prevMonth}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ fontSize:15, fontWeight:700 }}>{MONTHS[month]} {year}</div>
            <button
              className="btn btn-ghost"
              style={{ padding:"6px 10px" }}
              onClick={nextMonth}
              disabled={year === today.getFullYear() && month >= today.getMonth()}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Calendar */}
          {recLoading ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 0", gap:10, color:"var(--text-muted)" }}>
              <Loader2 size={18} className="animate-spin" />
              <span style={{ fontSize:13 }}>Loading attendance records…</span>
            </div>
          ) : (
            <InteractiveCalendar
              key={`${selectedEmp.id}-${year}-${month}-${refreshKey}`}
              year={year}
              month={month}
              records={records}
              emp={selectedEmp}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </div>
      ) : (
        <div className="card" style={{ padding:48, textAlign:"center", color:"var(--text-muted)" }}>
          <Users size={40} style={{ margin:"0 auto 14px", opacity:0.3 }} />
          <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>No employee selected</div>
          <div style={{ fontSize:12 }}>Pick an employee above to view and manage their attendance calendar</div>
        </div>
      )}
    </div>
  );
}
