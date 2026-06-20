"use client";
import { useState } from "react";
import {
  Crown, Briefcase, Mail, Phone, Globe, Linkedin,
  Award, Building2, TrendingUp, Users, DollarSign,
  Target, MessageSquare, X, Loader2, BarChart3,
  CheckCircle2, Zap, Star, ArrowUpRight, Activity,
  Layers, Clock, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type Member = {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  linkedin: string;
  bio: string;
  since: string;
  initials: string;
  accentColor: string;
  highlights: string[];
};

type KPI = {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  color: string;
  trend?: string;
};

/* ─────────────────────────────────────────────
   Data
───────────────────────────────────────────── */
const MEMBERS: Member[] = [
  {
    id: "sudarsanan",
    name: "Sudarsanan",
    title: "Managing Director (MD)",
    department: "Executive Leadership",
    email: "sudarsanan@makewithus.in",
    phone: "+91 62387 19566",
    linkedin: "https://www.linkedin.com/in/sudarsanan2004/",
    bio: "Visionary leader responsible for managing company operations, employee performance, project execution, and internal product development. Oversees organizational growth, resource planning, and ensures successful delivery of client and company-owned products.",
    since: "2024",
    initials: "SD",
    accentColor: "#E53E3E",
    highlights: [
      "Employee management & team coordination",
      "Project planning, tracking & delivery",
      "Internal product development & innovation",
      "Process optimization & operational efficiency",
      "Client project execution oversight",
      "Resource allocation & workflow management",
    ],
  },
  {
    id: "sherhan",
    name: "Sherhan",
    title: "Chief Executive Officer (CEO)",
    department: "Executive Leadership",
    email: "mosherhan@makewithus.in",
    phone: "+91 88385 14202",
    linkedin: "https://www.linkedin.com/in/mosherhan",
    bio: "Creative and strategic leader responsible for driving company vision, business growth, innovation, and design excellence. Focuses on identifying opportunities, shaping company direction, and developing ideas that strengthen the Make With Us brand.",
    since: "2024",
    initials: "SH",
    accentColor: "#3B82F6",
    highlights: [
      "Company vision & strategic planning",
      "Business growth & expansion initiatives",
      "Idea generation & innovation leadership",
      "Product conceptualization",
      "Design direction & creative oversight",
      "Brand development & market positioning",
    ],
  },
];

const ORG_STATS = [
  { label: "Founded",          value: "2024",              icon: Building2,  color: "#E53E3E" },
  { label: "Team Size",        value: "Growing Team",      icon: Users,      color: "#3B82F6" },
  { label: "Revenue Focus",    value: "B2B / B2C",         icon: TrendingUp, color: "#22C55E" },
  { label: "Payroll",          value: "In-house Managed",  icon: DollarSign, color: "#A855F7" },
];

const KPIS: KPI[] = [
  {
    label: "Projects Delivered",
    value: "26+",
    sub: "Across client & internal builds",
    icon: CheckCircle2,
    color: "#22C55E",
    trend: "+14 milestones hit",
  },
  {
    label: "Active Clients",
    value: "3",
    sub: "B2B & B2C engagements",
    icon: Star,
    color: "#F59E0B",
    trend: "Growing pipeline",
  },
  {
    label: "Team Utilisation",
    value: "94%",
    sub: "Avg. across all members",
    icon: Activity,
    color: "#3B82F6",
    trend: "↑ 6% vs last month",
  },
  {
    label: "Avg. Delivery Time",
    value: "2–5 days",
    sub: "Min 2 days · Max 5 days per cycle",
    icon: Clock,
    color: "#A855F7",
    trend: "↓ Fast turnaround",
  },
  {
    label: "Products in Pipeline",
    value: "5",
    sub: "Internal & client products",
    icon: Layers,
    color: "#E53E3E",
    trend: "2 launching soon",
  },
  {
    label: "Client Satisfaction",
    value: "4.8 / 5",
    sub: "Based on project feedback",
    icon: ShieldCheck,
    color: "#06B6D4",
    trend: "↑ 0.3 improvement",
  },
];

/* ─────────────────────────────────────────────
   Contact Modal
───────────────────────────────────────────── */
function ContactModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!msg.trim()) { toast.error("Message cannot be empty."); return; }
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success(`Message sent to ${member.name}!`);
    setSending(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="card emp-modal-box"
        style={{ padding: 28, width: 480, background: "var(--bg-primary)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: `${member.accentColor}20`, border: `2px solid ${member.accentColor}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: member.accentColor,
            }}>
              {member.initials}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Message {member.name}</div>
          </div>
          <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onClose}><X size={16} /></button>
        </div>
        <textarea
          className="input-base"
          rows={5}
          placeholder={`Write your message to ${member.name}…`}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          style={{ resize: "none", marginBottom: 14 }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1, gap: 6, background: member.accentColor, border: "none" }} onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
            {sending ? "Sending…" : "Send Message"}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Member Card
───────────────────────────────────────────── */
function MemberCard({ member }: { member: Member }) {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      {contactOpen && <ContactModal member={member} onClose={() => setContactOpen(false)} />}
      <div className="card" style={{ padding: 0, overflow: "hidden", transition: "transform 0.2s, box-shadow 0.2s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.18)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = ""; }}
      >
        {/* Gradient header band */}
        <div style={{ height: 5, background: `linear-gradient(90deg, ${member.accentColor}, ${member.accentColor}80)` }} />

        <div style={{ padding: "26px 28px" }}>
          {/* Avatar + name row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 20 }}>
            <div style={{
              width: 76, height: 76, borderRadius: "50%",
              background: `linear-gradient(135deg, ${member.accentColor}25, ${member.accentColor}08)`,
              border: `2.5px solid ${member.accentColor}60`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 800, color: member.accentColor, flexShrink: 0,
              boxShadow: `0 0 0 6px ${member.accentColor}10`,
            }}>
              {member.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{member.name}</div>
                <Crown size={13} color={member.accentColor} />
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700, color: member.accentColor,
                background: `${member.accentColor}15`, padding: "3px 10px",
                borderRadius: 99, marginBottom: 6,
              }}>
                {member.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                <Briefcase size={10} /> {member.department} · Since {member.since}
              </div>
            </div>
          </div>

          {/* Bio */}
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 20, padding: "12px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", borderLeft: `3px solid ${member.accentColor}` }}>
            {member.bio}
          </p>

          {/* Key Responsibilities */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>
              Key Responsibilities
            </div>
            <div className="emp-resp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 8px" }}>
              {member.highlights.map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: member.accentColor, flexShrink: 0, marginTop: 5 }} />
                  <span style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>{h}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>
              Contact Information
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                { icon: Mail,     value: member.email,    href: `mailto:${member.email}` },
                { icon: Phone,    value: member.phone,    href: `tel:${member.phone}` },
                { icon: Linkedin, value: member.linkedin, href: member.linkedin },
              ].map(({ icon: Icon, value, href }) => (
                <a key={href} href={href} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "6px 10px", borderRadius: 6, transition: "all 0.15s" }}
                  onMouseOver={(e) => { e.currentTarget.style.background = `${member.accentColor}10`; e.currentTarget.style.color = member.accentColor; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  <Icon size={13} color="var(--text-muted)" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
                  <ArrowUpRight size={11} style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.5 }} />
                </a>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, gap: 6, fontSize: 12, background: member.accentColor, border: "none" }}
              onClick={() => setContactOpen(true)}
            >
              <MessageSquare size={13} /> Send Message
            </button>
            <a
              href={`mailto:${member.email}`}
              className="btn btn-secondary"
              style={{ flex: 1, gap: 6, fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Mail size={13} /> Email
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   KPI Card
───────────────────────────────────────────── */
function KPICard({ kpi }: { kpi: KPI }) {
  return (
    <div
      className="card"
      style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12, transition: "transform 0.2s, box-shadow 0.2s", position: "relative", overflow: "hidden" }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.18)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = ""; }}
    >
      {/* Background glow */}
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 80, height: 80, borderRadius: "50%",
        background: `${kpi.color}15`, filter: "blur(20px)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${kpi.color}18`, border: `1px solid ${kpi.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <kpi.icon size={18} color={kpi.color} />
        </div>
        {kpi.trend && (
          <div style={{
            fontSize: 10, fontWeight: 600, color: kpi.color,
            background: `${kpi.color}15`, padding: "3px 8px", borderRadius: 99,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <Zap size={9} /> {kpi.trend}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)", lineHeight: 1 }}>
          {kpi.value}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{kpi.label}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{kpi.sub}</div>
      </div>

      {/* Bottom accent line */}
      <div style={{ height: 2, borderRadius: 99, background: `linear-gradient(90deg, ${kpi.color}60, transparent)`, marginTop: "auto" }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function EmployerPage() {
  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .emp-org-grid    { grid-template-columns: repeat(2, 1fr) !important; }
          .emp-member-grid { grid-template-columns: 1fr !important; }
          .emp-kpi-grid    { grid-template-columns: repeat(2, 1fr) !important; }
          .emp-vision-grid { grid-template-columns: 1fr !important; }
          .emp-resp-grid   { grid-template-columns: 1fr !important; }
          .emp-modal-box   { width: calc(100vw - 32px) !important; max-width: 100% !important; }
        }
        @media (max-width: 480px) {
          .emp-org-grid  { grid-template-columns: 1fr !important; }
          .emp-kpi-grid  { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div className="page-container">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Employer</h1>
          <p className="page-subtitle">Executive leadership and company principals</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)" }}>
          <Building2 size={13} />
          makewithus Pvt Ltd
        </div>
      </div>

      {/* ── Company Overview Cards ── */}
      <div className="emp-org-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {ORG_STATS.map((s) => (
          <div key={s.label} className="card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", bottom: -12, right: -12,
              width: 60, height: 60, borderRadius: "50%",
              background: `${s.color}12`, filter: "blur(12px)", pointerEvents: "none",
            }} />
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <s.icon size={17} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Executive Leadership ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Crown size={15} color="var(--brand-red)" />
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          Executive Leadership Team
        </div>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      <div className="emp-member-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 36 }}>
        {MEMBERS.map((m) => <MemberCard key={m.id} member={m} />)}
      </div>

      {/* ── KPI Section ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <BarChart3 size={15} color="var(--brand-red)" />
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          Company KPIs
        </div>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "3px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 99 }}>
          FY 2024–25
        </div>
      </div>

      <div className="emp-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 36 }}>
        {KPIS.map((k) => <KPICard key={k.label} kpi={k} />)}
      </div>

      {/* ── Company Vision Block ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Target size={15} color="var(--brand-red)" />
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          Vision &amp; Mission
        </div>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="emp-vision-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {[
            {
              icon: Award,
              title: "Vision",
              color: "#E53E3E",
              desc: "To be the most trusted partner for businesses seeking technology-driven growth, building sustainable impact across industries.",
            },
            {
              icon: Target,
              title: "Mission",
              color: "#3B82F6",
              desc: "Empowering teams through innovative tools, transparent processes, and people-first leadership that unlocks every individual's potential.",
            },
            {
              icon: Globe,
              title: "Values",
              color: "#22C55E",
              desc: "Integrity, Innovation, Ownership, and Excellence — the four pillars that guide every decision from the executive level down.",
            },
          ].map((v) => (
            <div key={v.title} style={{ padding: 18, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", borderTop: `3px solid ${v.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <v.icon size={14} color={v.color} />
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{v.title}</div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
      </div>
    </>
  );
}
