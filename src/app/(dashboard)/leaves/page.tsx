"use client";
import { useState, useEffect } from "react";
import { Plus, Check, X, MessageSquare, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LEAVE_TYPES } from "@/lib/utils";
import { toLocalDateString } from "@/lib/attendanceService";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, updateDoc,
  onSnapshot, query, where, orderBy, serverTimestamp,
} from "firebase/firestore";

const schema = z.object({
  leaveType: z.string().min(1, "Select a leave type"),
  startDate: z.string().min(1, "Start date is required"),
  endDate:   z.string().min(1, "End date is required"),
  reason:    z.string().min(1, "Please provide a reason"),
}).superRefine((d, ctx) => {
  const currentToday = toLocalDateString(new Date());
  if (d.startDate && d.startDate < currentToday) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start date cannot be in the past.",
      path: ["startDate"],
    });
  }
  if (d.endDate && d.endDate < currentToday) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date cannot be in the past.",
      path: ["endDate"],
    });
  }
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date cannot be earlier than the start date.",
      path: ["endDate"],
    });
  }
});
type FormData = z.infer<typeof schema>;

const STATUS_COLOR: Record<string, string> = {
  Pending:  "var(--accent-amber)",
  Approved: "var(--accent-green)",
  Rejected: "var(--accent-red)",
  Cancelled:"var(--text-muted)",
};
const STATUS_BG: Record<string, string> = {
  Pending:  "var(--accent-amber-dim)",
  Approved: "var(--accent-green-dim)",
  Rejected: "var(--accent-red-dim)",
  Cancelled:"rgba(255,255,255,0.06)",
};


type LeaveRow = {
  id: string;
  name: string;
  type: string;
  start: string;
  end: string;
  days: number;
  status: string;
  dept: string;
  reason?: string;
  employeeId?: string;
  rawStartDate?: string;
  rawEndDate?: string;
  rawCreatedAt?: any;
};

const TABS = ["All", "Pending", "Approved", "Rejected", "Cancelled"];

export default function LeavesPage() {
  const { user, role, profile } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema), mode: "onChange" });

  const watchStartDate = watch("startDate");
  const todayStr = toLocalDateString(new Date());

  /* ── Real-time listener on leaveRequests collection ── */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let unsub = () => {};
    if (!isAdmin && !profile?.employeeId) {
      setLoading(false);
      return;
    }
    const t = setTimeout(() => {
      let q;
      if (isAdmin) {
        q = query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"));
      } else {
        q = query(
          collection(db, "leaveRequests"),
          where("employeeId", "==", profile?.employeeId ?? "")
        );
      }
      unsub = onSnapshot(
        q,
        (snap) => {
          const rows: LeaveRow[] = snap.docs.map((d) => {
            const data = d.data();
            const start = data.startDate ?? "";
            const end   = data.endDate   ?? "";
            return {
              id:         d.id,
              name:       data.employeeName ?? "Employee",
              type:       data.leaveType   ?? "",
              start:      start ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
              end:        end   ? new Date(end  ).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
              rawStartDate: start,
              rawEndDate:   end,
              days:       data.days        ?? 1,
              status:     data.status      ?? "Pending",
              dept:       data.department  ?? "",
              reason:     data.reason      ?? "",
              employeeId: data.employeeId  ?? "",
              rawCreatedAt: data.createdAt,
            };
          });
          if (!isAdmin) {
            rows.sort((a: any, b: any) => {
              const aTime = a.rawCreatedAt?.toMillis?.() || (a.rawCreatedAt?.seconds ? a.rawCreatedAt.seconds * 1000 : 0);
              const bTime = b.rawCreatedAt?.toMillis?.() || (b.rawCreatedAt?.seconds ? b.rawCreatedAt.seconds * 1000 : 0);
              return bTime - aTime;
            });
          }
          setRequests(rows);
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
    }, 10);
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [isAdmin, profile?.employeeId]);


  /* ── Submit leave (employee) — writes to Firestore ── */
  const onInvalid = (fieldErrors: any) => {
    if (fieldErrors.endDate) {
      toast.error(fieldErrors.endDate.message || "End date cannot be earlier than the start date.");
    } else if (fieldErrors.startDate) {
      toast.error(fieldErrors.startDate.message || "Start date is required.");
    } else if (fieldErrors.leaveType) {
      toast.error(fieldErrors.leaveType.message || "Please select a leave type.");
    } else if (fieldErrors.reason) {
      toast.error(fieldErrors.reason.message || "Please provide a reason.");
    } else {
      toast.error("Please fill all required fields correctly.");
    }
  };

  const onSubmit = async (data: FormData) => {
    const currentToday = toLocalDateString(new Date());
    if (data.startDate < currentToday) {
      toast.error("Start date cannot be in the past.");
      return;
    }
    if (data.endDate < currentToday) {
      toast.error("End date cannot be in the past.");
      return;
    }
    if (data.endDate < data.startDate) {
      toast.error("End date cannot be earlier than the start date.");
      return;
    }

    const empId = profile?.employeeId ?? "unknown";

    // Duplicate submission & overlapping date range prevention
    const hasDuplicateOrOverlap = requests.some(
      (r) =>
        r.employeeId === empId &&
        (r.status === "Pending" || r.status === "Approved") &&
        r.rawStartDate &&
        r.rawEndDate &&
        !(data.endDate < r.rawStartDate || data.startDate > r.rawEndDate)
    );

    if (hasDuplicateOrOverlap) {
      toast.error("You already have an active or pending leave request covering these dates.");
      return;
    }

    const startMs = new Date(data.startDate).getTime();
    const endMs = new Date(data.endDate).getTime();
    const diffTime = endMs - startMs;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    try {
      // 1. Authoritative primary write (ultra-fast, non-blocking)
      await addDoc(collection(db, "leaveRequests"), {
        employeeId:   empId,
        employeeName: profile?.displayName ?? "Employee",
        leaveType:    data.leaveType,
        startDate:    data.startDate,
        endDate:      data.endDate,
        days:         diffDays,
        reason:       data.reason,
        status:       "Pending",
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
      });

      // Immediate UI feedback — instantaneous response!
      toast.success("Leave request submitted successfully!");
      reset();
      setShowForm(false);

      // 2. Dispatch admin notifications asynchronously in the background
      (async () => {
        try {
          const { getDocs } = await import("firebase/firestore");
          const adminSnap = await getDocs(
            query(collection(db, "users"), where("role", "in", ["super_admin", "hr_admin"]))
          );
          const adminUids = adminSnap.docs.map((d) => d.id);
          if (adminUids.length === 0) adminUids.push("admin");

          await Promise.allSettled(
            adminUids.map((adId) =>
              addDoc(collection(db, "notifications"), {
                companyId: profile?.companyId ?? "default",
                userId: adId,
                senderUid: user?.uid ?? profile?.uid,
                createdBy: user?.uid ?? profile?.uid,
                targetRole: "admin",
                title: "New Leave Request Submitted",
                message: `${profile?.displayName ?? "Employee"} submitted a ${data.leaveType} leave request for ${diffDays} day(s) (${data.startDate} to ${data.endDate})`,
                type: "leave",
                isRead: false,
                link: "/leaves",
                createdAt: serverTimestamp(),
              })
            )
          );
        } catch {
          // Fallback to broadcast admin notification
          await addDoc(collection(db, "notifications"), {
            companyId: profile?.companyId ?? "default",
            userId: "admin",
            senderUid: user?.uid ?? profile?.uid,
            createdBy: user?.uid ?? profile?.uid,
            targetRole: "admin",
            title: "New Leave Request Submitted",
            message: `${profile?.displayName ?? "Employee"} submitted a ${data.leaveType} leave request for ${diffDays} day(s) (${data.startDate} to ${data.endDate})`,
            type: "leave",
            isRead: false,
            link: "/leaves",
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      })().catch((err) => console.warn("Background notification dispatch:", err));

    } catch (err: any) {
      console.error("Leave request submission error:", err);
      const apiMessage = err?.message
        ? `Failed to submit leave request: ${err.message}`
        : "Failed to submit leave request. Please check permissions and try again.";
      toast.error(apiMessage);
    }
  };

  /* ── Cancel leave request (employee) ── */
  const handleCancelLeave = async (id: string) => {
    try {
      const { doc: fsDoc } = await import("firebase/firestore");
      await updateDoc(fsDoc(db, "leaveRequests", id), {
        status: "Cancelled",
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Leave request cancelled successfully.");
    } catch {
      toast.error("Failed to cancel leave request.");
    }
  };

  /* ── Approve / Reject (admin) — updates Firestore ── */
  const handleAction = async (id: string, status: "Approved" | "Rejected") => {
    try {
      const { getDoc, setDoc, doc: fsDoc } = await import("firebase/firestore");
      
      const leaveRef = fsDoc(db, "leaveRequests", id);
      const leaveSnap = await getDoc(leaveRef);
      
      if (!leaveSnap.exists()) {
        toast.error("Leave request not found.");
        return;
      }
      
      const leaveData = leaveSnap.data();

      await updateDoc(leaveRef, {
        status,
        reviewedBy: profile?.displayName ?? "Admin",
        reviewedAt: serverTimestamp(),
        updatedAt:  serverTimestamp(),
      });

      // If approved, insert attendance records for the dates
      if (status === "Approved" && leaveData.startDate && leaveData.endDate && leaveData.employeeId) {
        const start = new Date(leaveData.startDate);
        const end = new Date(leaveData.endDate);
        const empId = leaveData.employeeId;
        const empName = leaveData.employeeName ?? "Employee";
        const dept = leaveData.department ?? "";

        const current = new Date(start);
        while (current <= end) {
          const dateStr = current.toISOString().split("T")[0];
          const attRef = fsDoc(db, "attendance", `${empId}_${dateStr}`);
          
          await setDoc(attRef, {
            employeeId: empId,
            employeeName: empName,
            department: dept,
            date: dateStr,
            status: "Holiday",
            notes: `${leaveData.leaveType || "Approved"} Leave`,
            manuallyMarked: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true }); // Use merge in case they clocked in previously
          
          current.setDate(current.getDate() + 1);
        }
      }

      toast.success(`Leave request ${status.toLowerCase()} successfully!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update leave request.");
    }
  };

  const filtered = activeTab === "All" ? requests : requests.filter((r) => r.status === activeTab);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">
            {isAdmin
              ? `${requests.filter((r) => r.status === "Pending").length} pending requests`
              : "Apply for leave and track your requests"}
          </p>
        </div>
        {!isAdmin && (
          <button id="leave-apply-btn" className="btn btn-primary" style={{ gap: 6 }} onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> Apply Leave
          </button>
        )}
      </div>

      {/* Admin Summary Stats */}
      {isAdmin && (
        <div className="att-stats-grid" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Requests", value: requests.length, color: "var(--text-primary)" },
            { label: "Pending", value: requests.filter(r => r.status === "Pending").length, color: "var(--accent-amber)" },
            { label: "Approved", value: requests.filter(r => r.status === "Approved").length, color: "var(--accent-green)" },
            { label: "Rejected", value: requests.filter(r => r.status === "Rejected").length, color: "var(--accent-red)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}


      {/* Apply form */}
      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 24, maxWidth: 560 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>New Leave Request</div>
          <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Leave Type</label>
                <select id="leave-type" className="input-base" {...register("leaveType")}>
                  <option value="">Select type</option>
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.leaveType && <p style={{ fontSize: 12, color: "var(--accent-red)", marginTop: 4 }}>{errors.leaveType.message}</p>}
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Start Date</label>
                <input
                  id="leave-start"
                  type="date"
                  min={todayStr}
                  className="input-base"
                  {...register("startDate")}
                />
                {errors.startDate && <p id="leave-start-error" style={{ fontSize: 12, color: "var(--accent-red)", marginTop: 4 }}>{errors.startDate.message}</p>}
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>End Date</label>
                <input
                  id="leave-end"
                  type="date"
                  min={watchStartDate && watchStartDate >= todayStr ? watchStartDate : todayStr}
                  className="input-base"
                  {...register("endDate")}
                />
                {errors.endDate && <p id="leave-end-error" style={{ fontSize: 12, color: "var(--accent-red)", marginTop: 4 }}>{errors.endDate.message}</p>}
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Reason</label>
                <textarea id="leave-reason" className="input-base" rows={3} placeholder="Describe the reason…" {...register("reason")} />
                {errors.reason && <p style={{ fontSize: 12, color: "var(--accent-red)", marginTop: 4 }}>{errors.reason.message}</p>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="submit" id="leave-submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                Submit Request
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{ padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === t ? 600 : 400, color: activeTab === t ? "var(--accent-blue)" : "var(--text-secondary)", borderBottom: `2px solid ${activeTab === t ? "var(--accent-blue)" : "transparent"}`, marginBottom: -1 }}
          >
            {t}
            {t === "Pending" && requests.filter((r) => r.status === "Pending").length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: "var(--accent-amber)", color: "#fff", borderRadius: 99, padding: "1px 6px" }}>
                {requests.filter((r) => r.status === "Pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 10, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Loading leave requests…</span>
        </div>
      )}

      {/* Requests list */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((r) => (
            <div key={r.id} className="card leave-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-blue-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--accent-blue)" }}>
                  {r.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{isAdmin ? r.name : "My Request"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {r.type} · {r.start} – {r.end} · {r.days} day{r.days > 1 ? "s" : ""}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                      <span style={{ color: "var(--text-muted)" }}>Reason:</span> {r.reason}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="badge" style={{ background: STATUS_BG[r.status] ?? "rgba(255,255,255,0.06)", color: STATUS_COLOR[r.status] ?? "var(--text-muted)" }}>
                  {r.status}
                </span>
                {!isAdmin && r.status === "Pending" && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "5px 10px", fontSize: 12, gap: 4, color: "var(--accent-red)" }}
                    onClick={() => handleCancelLeave(r.id)}
                  >
                    <X size={12} /> Cancel Request
                  </button>
                )}
                {isAdmin && r.status === "Pending" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 12, gap: 4 }} onClick={() => handleAction(r.id, "Approved")}><Check size={12} /> Approve</button>
                    <button className="btn btn-danger"  style={{ padding: "5px 10px", fontSize: 12, gap: 4 }} onClick={() => handleAction(r.id, "Rejected")}><X size={12} /> Reject</button>
                    <button className="btn btn-ghost"   style={{ padding: "5px 8px" }}><MessageSquare size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)", fontSize: 13 }}>
              No {activeTab === "All" ? "" : activeTab.toLowerCase()} leave requests yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
