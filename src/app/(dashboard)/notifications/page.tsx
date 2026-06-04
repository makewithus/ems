"use client";
import { useState } from "react";
import { Bell, Check, CheckCheck, CalendarDays, DollarSign, ClipboardList, FolderOpen, Clock, Megaphone } from "lucide-react";
import { timeAgo } from "@/lib/utils";

const TYPE_CONFIG = {
  leave:      { icon: CalendarDays, color: "var(--accent-blue)",   bg: "var(--accent-blue-dim)"   },
  payslip:    { icon: DollarSign,   color: "var(--accent-purple)", bg: "var(--accent-purple-dim)" },
  task:       { icon: ClipboardList,color: "var(--accent-amber)",  bg: "var(--accent-amber-dim)"  },
  document:   { icon: FolderOpen,   color: "var(--accent-green)",  bg: "var(--accent-green-dim)"  },
  attendance: { icon: Clock,        color: "var(--accent-red)",    bg: "var(--accent-red-dim)"    },
  notice:     { icon: Megaphone,    color: "var(--accent-blue)",   bg: "var(--accent-blue-dim)"   },
  general:    { icon: Bell,         color: "var(--text-muted)",    bg: "rgba(255,255,255,0.06)"   },
};

const INIT_NOTIFS = [
  { id:"1", type:"leave" as const,      title:"Leave Approved",          message:"Your Casual Leave for May 24 has been approved by HR Admin.",              time:"2025-05-22T14:30:00Z", read:false },
  { id:"2", type:"payslip" as const,    title:"Payslip Generated",       message:"Your payslip for May 2025 is ready. Click to view and download.",          time:"2025-05-22T10:00:00Z", read:false },
  { id:"3", type:"task" as const,       title:"New Task Assigned",       message:"Kiran Kumar assigned you: 'Update employee handbook'.",                    time:"2025-05-21T16:45:00Z", read:false },
  { id:"4", type:"document" as const,   title:"Document Uploaded",       message:"HR Admin uploaded: 'Q1_Payroll_Report.xlsx'.",                             time:"2025-05-21T11:20:00Z", read:true  },
  { id:"5", type:"attendance" as const, title:"Missing Clock-in",        message:"You did not clock in on May 20. Contact HR for correction.",               time:"2025-05-20T09:00:00Z", read:true  },
  { id:"6", type:"notice" as const,     title:"New Notice Posted",       message:"Office Closure on May 30, 2025 — read the full notice.",                  time:"2025-05-20T08:00:00Z", read:true  },
  { id:"7", type:"general" as const,    title:"Welcome to EMS Pro",      message:"Your account has been set up. Explore the dashboard to get started.",      time:"2025-05-15T09:00:00Z", read:true  },
];

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState(INIT_NOTIFS);
  const [filter, setFilter] = useState<"all"|"unread">("all");

  const markRead    = (id: string) => setNotifs((p) => p.map((n) => n.id===id ? {...n,read:true} : n));
  const markAllRead = ()           => setNotifs((p) => p.map((n) => ({...n,read:true})));

  const shown = filter==="unread" ? notifs.filter((n) => !n.read) : notifs;
  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">{unreadCount>0 ? `${unreadCount} unread` : "All caught up!"}</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <div style={{ display:"flex", background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)", padding:3, border:"1px solid var(--border)", gap:2 }}>
            {(["all","unread"] as const).map((f) => (
              <button key={f} onClick={()=>setFilter(f)} className={`btn ${filter===f?"btn-primary":"btn-ghost"}`} style={{ padding:"5px 14px", fontSize:12 }}>
                {f==="unread" ? `Unread (${unreadCount})` : "All"}
              </button>
            ))}
          </div>
          {unreadCount>0 && (
            <button id="notif-mark-all" onClick={markAllRead} className="btn btn-secondary" style={{ gap:6, fontSize:13 }}>
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:6, maxWidth:760 }}>
        {shown.map((n) => {
          const cfg = TYPE_CONFIG[n.type];
          return (
            <div key={n.id} onClick={()=>markRead(n.id)} style={{ display:"flex", gap:14, padding:"16px 18px", background:n.read?"var(--bg-secondary)":"var(--bg-elevated)", border:`1px solid ${n.read?"var(--border)":"var(--border-strong)"}`, borderRadius:"var(--radius-sm)", cursor:"pointer", transition:"background 0.15s" }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <cfg.icon size={17} color={cfg.color} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:13.5, fontWeight:n.read?400:600 }}>{n.title}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:12 }}>
                    <span style={{ fontSize:11, color:"var(--text-muted)" }}>{timeAgo(n.time)}</span>
                    {!n.read && <div style={{ width:7, height:7, borderRadius:"50%", background:"var(--accent-blue)" }} />}
                  </div>
                </div>
                <p style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.55 }}>{n.message}</p>
              </div>
              {!n.read && (
                <button className="btn btn-ghost" style={{ padding:"4px 8px", alignSelf:"center" }} onClick={(e)=>{ e.stopPropagation(); markRead(n.id); }}>
                  <Check size={13} />
                </button>
              )}
            </div>
          );
        })}
        {shown.length===0 && (
          <div style={{ textAlign:"center", padding:"64px 0", color:"var(--text-muted)" }}>
            <Bell size={36} style={{ margin:"0 auto 12px", opacity:0.3 }} />
            <p style={{ fontSize:14 }}>No {filter==="unread"?"unread ":""}notifications.</p>
          </div>
        )}
      </div>
    </div>
  );
}
