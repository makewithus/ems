"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Edit2, UserCheck, UserX, Mail, Phone,
  MapPin, Building2, Calendar, DollarSign, Loader2,
  Save, X, ChevronDown, Eye, EyeOff, CalendarClock,
  KeyRound, ClipboardList,
} from "lucide-react";
import { formatDate, getInitials, formatCurrency, EMPLOYMENT_TYPES, calculateProfileCompletion, computeHoursWorked, formatPayrollMonth } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, query, where, getDocs,
} from "firebase/firestore";
import { updateEmployeeAuth } from "@/lib/firebase-secondary";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";

/* ── Types ────────────────────────────────────────────────── */
type Emp = {
  id: string;
  uid?: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  address: string;
  department: string;
  designation: string;
  joiningDate: string;
  employmentType: string;
  salary: number;
  salaryDate: string;
  status: string;
  password?: string;
  profileCompletion?: number;
  companyId?: string;
};

const TABS = ["Overview", "Attendance", "Leaves", "Payroll", "Documents", "Tasks", "Activity"];

/* ── Inline edit modal ────────────────────────────────────── */
function EditModal({ emp, onClose, onSaved }: { emp: Emp; onClose: () => void; onSaved: (updated: Emp) => void }) {
  const [form, setForm] = useState<Emp>({ ...emp });
  const [saving, setSaving] = useState(false);
  const { departments } = useDepartments();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [passError, setPassError] = useState("");

  const set = (k: keyof Emp, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setPassError("");
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("First and last name are required"); return;
    }

    if (newPassword.trim() !== "") {
      if (newPassword !== confirmPassword) {
        setPassError("New passwords do not match."); return;
      }
    }

    const credentialsChanged =
      form.email !== emp.email ||
      newPassword.trim() !== "";

    setSaving(true);
    try {
      let updatedEmail = form.email;
      let finalUid = emp.uid;

      if (credentialsChanged) {
        // Update credentials in Auth
        const res = await updateEmployeeAuth(
          emp.email,
          "",
          form.email,
          newPassword.trim() || undefined
        );
        updatedEmail = res.email;
        if (res.uid) {
          finalUid = res.uid;
        }
      }

      // Update employee record
      await updateDoc(doc(db, "employees", emp.id), {
        firstName:      form.firstName.trim(),
        lastName:       form.lastName.trim(),
        email:          updatedEmail,
        uid:            finalUid,
        phone:          form.phone.trim(),
        dob:            form.dob,
        gender:         form.gender,
        address:        form.address.trim(),
        department:     form.department,
        designation:    form.designation.trim(),
        joiningDate:    form.joiningDate,
        employmentType: form.employmentType,
        salary:         Number(form.salary),
        salaryDate:     form.salaryDate,
        employeeId:     form.employeeId,
        updatedAt:      serverTimestamp(),
      });

      // Update user profile record as well if uid exists
      if (finalUid) {
        // If finalUid changed (forced reset), we should setDoc to ensure the document exists
        const { setDoc } = await import("firebase/firestore");
        await setDoc(doc(db, "users", finalUid), {
          uid:            finalUid,
          email:          updatedEmail,
          displayName:    `${form.firstName} ${form.lastName}`.trim(),
          employeeId:     form.employeeId,
          role:           "employee",
          companyId:      emp.companyId || "default",
          updatedAt:      serverTimestamp(),
        }, { merge: true });
      }

      toast.success("Employee updated successfully!");
      onSaved({
        ...form,
        email: updatedEmail,
        password: form.password || emp.password || "",
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save changes";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({
    label, field, type = "text", options,
  }: {
    label: string;
    field: keyof Emp;
    type?: string;
    options?: string[];
  }) => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      {options ? (
        <div style={{ position: "relative" }}>
          <select
            className="input-base"
            style={{ appearance: "none", paddingRight: 32 }}
            value={String(form[field])}
            onChange={(e) => set(field, e.target.value)}
          >
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
        </div>
      ) : (
        <input
          type={type}
          className="input-base"
          value={String(form[field])}
          onChange={(e) => set(field, type === "number" ? Number(e.target.value) : e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding: 32, width: "100%", maxWidth: 560, background: "var(--bg-primary)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Edit Employee</div>
          <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="First Name"       field="firstName" />
          <Field label="Last Name"        field="lastName" />
          <Field label="Employee ID"      field="employeeId" />
          <Field label="Phone"            field="phone" />
          <Field label="Designation"      field="designation" />
          <Field label="Department"       field="department" options={departments} />
          <Field label="Employment Type"  field="employmentType" options={[...EMPLOYMENT_TYPES]} />
          <Field label="Salary (₹)"       field="salary" type="number" />
          <Field label="Salary Date"      field="salaryDate" type="date" />
          <Field label="Date of Birth"    field="dob" type="date" />
          <Field label="Joining Date"     field="joiningDate" type="date" />
          <Field label="Gender"           field="gender" options={["Male", "Female", "Other", "Prefer not to say"]} />
          <div style={{ gridColumn: "1/-1" }}>
            <Field label="Address" field="address" />
          </div>
          
          {/* Credentials Section */}
          <div style={{ gridColumn: "1/-1", borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <KeyRound size={14} color="var(--brand-red)" />
              <span>Portal Credentials</span>
            </h3>
          </div>
          <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Login Email (Username)
              </label>
              <input
                type="email"
                className="input-base"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Authentication Status
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="password"
                  className="input-base"
                  readOnly
                  value="••••••••••••"
                  title="Passwords are encrypted and securely managed by Firebase Authentication"
                  style={{ color: "var(--text-muted)", paddingRight: 40, cursor: "not-allowed" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                New Password (Optional)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  className="input-base"
                  placeholder="Leave blank to keep current"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPassError(""); }}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "4px 6px" }}
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: passError ? "var(--accent-red)" : "var(--text-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Confirm New Password
              </label>
              <div style={{ position: "relative" }} className={passError ? "animate-shake" : ""}>
                <input
                  type={showConfirmPass ? "text" : "password"}
                  className="input-base"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPassError(""); }}
                  style={{ paddingRight: 40, borderColor: passError ? "var(--accent-red)" : undefined, boxShadow: passError ? "0 0 0 1px var(--accent-red)" : "none" }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "4px 6px" }}
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                >
                  {showConfirmPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {passError && <div style={{ fontSize: 11, color: "var(--accent-red)", marginTop: 4, fontWeight: 500 }}>{passError}</div>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button className="btn btn-primary" style={{ flex: 1, gap: 6 }} onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function parseSalaryDay(salaryDate: string | number | undefined): number | null {
  if (salaryDate === undefined || salaryDate === null || salaryDate === "") return null;
  const num = Number(salaryDate);
  if (!isNaN(num) && num >= 1 && num <= 31) {
    return num;
  }
  const parsed = new Date(String(salaryDate));
  if (!isNaN(parsed.getTime())) {
    return parsed.getDate();
  }
  return null;
}

function formatSalaryDateDisplay(salaryDate: string | number | undefined): string {
  if (!salaryDate) return "—";
  const day = parseSalaryDay(salaryDate);
  if (day !== null) {
    return `${day}${getOrdinal(day)} of each month`;
  }
  return formatDate(String(salaryDate));
}

/* ── Adjusted Payment Date Card ──────────────────────────── */
function AdjustedPaymentCard({ employeeId, salaryDate }: { employeeId: string; salaryDate: string | number }) {
  const [absentCount, setAbsentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  const baseDayOfMonth = parseSalaryDay(salaryDate);

  useEffect(() => {
    if (!employeeId) return;
    const fetchAbsent = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "attendance"),
          where("employeeId", "==", employeeId),
          where("status", "==", "Absent")
        );
        const snap = await getDocs(q);
        const count = snap.docs.filter(d => {
          const date = d.data().date ?? "";
          return date.startsWith(prefix);
        }).length;
        setAbsentCount(count);
      } catch {
        setAbsentCount(0);
      } finally {
        setLoading(false);
      }
    };
    fetchAbsent();
  }, [employeeId, prefix]);

  const adjustedDate = useMemo(() => {
    if (baseDayOfMonth === null) return null;
    try {
      // Use the salary date's day-of-month in the current month/year
      const payDate = new Date(currentYear, currentMonth, baseDayOfMonth);
      payDate.setDate(payDate.getDate() + absentCount);
      return payDate;
    } catch {
      return null;
    }
  }, [baseDayOfMonth, absentCount, currentMonth, currentYear]);

  if (loading) return null;
  if (!adjustedDate || baseDayOfMonth === null) return null;

  return (
    <div className="card" style={{
      marginTop: 12, padding: "16px 20px",
      background: absentCount > 0 ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)",
      border: `1px solid ${absentCount > 0 ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <CalendarClock size={16} color={absentCount > 0 ? "var(--accent-red)" : "var(--accent-green)"} />
        <div style={{ fontSize: 13, fontWeight: 700 }}>Adjusted Payment Date</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
            Base Salary Day
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{baseDayOfMonth}{getOrdinal(baseDayOfMonth)} of month</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
            Absent Days ({MONTHS_SHORT[currentMonth]})
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: absentCount > 0 ? "var(--accent-red)" : "var(--accent-green)" }}>
            {absentCount} day{absentCount !== 1 ? "s" : ""}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
            Adjusted Date
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: absentCount > 0 ? "var(--accent-red)" : "var(--accent-green)" }}>
            {adjustedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>
      {absentCount > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }}>
          Payment date shifted by +{absentCount} day{absentCount !== 1 ? "s" : ""} due to absences in {MONTHS_SHORT[currentMonth]}
        </div>
      )}
    </div>
  );
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ── Live Tab Sub-components (A-30 remediation) ──────────── */
function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    const fetchAttendance = async () => {
      try {
        const q = query(collection(db, "attendance"), where("employeeId", "==", employeeId));
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
        setRecords(rows);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [employeeId]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={18} className="animate-spin" /> Loading attendance…</div>;
  }

  if (records.length === 0) {
    return <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No attendance records found for this employee.</div>;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px" }}>Date</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
              <th style={{ padding: "12px 16px" }}>Clock In</th>
              <th style={{ padding: "12px 16px" }}>Clock Out</th>
              <th style={{ padding: "12px 16px" }}>Worked Hours</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const worked = computeHoursWorked(r.clockIn, r.clockOut, r.breakStart, r.breakEnd);
              return (
                <tr key={r.id}>
                  <td style={{ padding: "12px 16px" }}>{formatDate(r.date)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className="badge" style={{
                      background: r.status === "Present" ? "var(--accent-green-dim)" : r.status === "Late" ? "var(--accent-amber-dim)" : "var(--accent-red-dim)",
                      color: r.status === "Present" ? "var(--accent-green)" : r.status === "Late" ? "var(--accent-amber)" : "var(--accent-red)",
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>{r.clockIn || "—"}</td>
                  <td style={{ padding: "12px 16px" }}>{r.clockOut || "—"}</td>
                  <td style={{ padding: "12px 16px" }}>{worked || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeTasksTab({ emp }: { emp: Emp }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { role } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        let snapDocs: any[] = [];
        if (isAdmin) {
          const snap = await getDocs(collection(db, "tasks"));
          snapDocs = snap.docs;
        } else {
          const targetUid = emp.uid || "";
          const q1 = targetUid ? query(collection(db, "tasks"), where("assigneeId", "==", targetUid)) : null;
          const q2 = targetUid ? query(collection(db, "tasks"), where("assignedTo", "==", targetUid)) : null;
          const [s1, s2] = await Promise.all([
            q1 ? getDocs(q1) : Promise.resolve({ docs: [] }),
            q2 ? getDocs(q2) : Promise.resolve({ docs: [] }),
          ]);
          const map = new Map();
          s1.docs.forEach((d) => map.set(d.id, d));
          s2.docs.forEach((d) => map.set(d.id, d));
          snapDocs = Array.from(map.values());
        }

        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        const rows = snapDocs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((t: any) => {
            return (
              t.assigneeId === emp.uid ||
              t.assigneeId === emp.employeeId ||
              t.assignedTo === emp.uid ||
              t.assignedTo === emp.employeeId ||
              (t.assigneeName && t.assigneeName.toLowerCase() === fullName)
            );
          });
        setTasks(rows);
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [emp, isAdmin]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={18} className="animate-spin" /> Loading tasks…</div>;
  }

  if (tasks.length === 0) {
    return <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No tasks assigned to this employee.</div>;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px" }}>Task</th>
              <th style={{ padding: "12px 16px" }}>Priority</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
              <th style={{ padding: "12px 16px" }}>Deadline</th>
              <th style={{ padding: "12px 16px" }}>Effort</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  {t.description && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{t.description.slice(0, 50)}...</div>}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="badge badge-gray">{t.priority || "Medium"}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="badge" style={{
                    background: t.status === "completed" ? "var(--accent-green-dim)" : t.status === "in_progress" ? "var(--accent-blue-dim)" : "var(--bg-elevated)",
                    color: t.status === "completed" ? "var(--accent-green)" : t.status === "in_progress" ? "var(--accent-blue)" : "var(--text-muted)",
                  }}>
                    {t.status?.replace("_", " ")}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>{t.deadline ? formatDate(t.deadline) : "—"}</td>
                <td style={{ padding: "12px 16px" }}>{t.estimatedHours ? `${t.estimatedHours} hrs` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeLeavesTab({ employeeId, uid }: { employeeId: string; uid?: string }) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    const fetchLeaves = async () => {
      try {
        const q = query(collection(db, "leaveRequests"), where("employeeId", "==", employeeId));
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((l: any) => l.employeeId === employeeId || (uid && l.userId === uid));
        setLeaves(rows);
      } catch {
        setLeaves([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaves();
  }, [employeeId, uid]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={18} className="animate-spin" /> Loading leaves…</div>;
  }

  if (leaves.length === 0) {
    return <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No leave requests found.</div>;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px" }}>Type</th>
              <th style={{ padding: "12px 16px" }}>Duration</th>
              <th style={{ padding: "12px 16px" }}>Reason</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id}>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{l.leaveType}</td>
                <td style={{ padding: "12px 16px" }}>{formatDate(l.startDate)} - {formatDate(l.endDate)}</td>
                <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: 13 }}>{l.reason || "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="badge" style={{
                    background: l.status === "Approved" ? "var(--accent-green-dim)" : l.status === "Rejected" ? "var(--accent-red-dim)" : "var(--accent-amber-dim)",
                    color: l.status === "Approved" ? "var(--accent-green)" : l.status === "Rejected" ? "var(--accent-red)" : "var(--accent-amber)",
                  }}>
                    {l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeePayrollTab({ employeeId }: { employeeId: string }) {
  const [payroll, setPayroll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayroll = async () => {
      try {
        const snap = await getDocs(query(collection(db, "payroll"), where("employeeId", "==", employeeId)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPayroll(rows);
      } catch {
        setPayroll([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPayroll();
  }, [employeeId]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={18} className="animate-spin" /> Loading payroll…</div>;
  }

  if (payroll.length === 0) {
    return <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No payroll records found.</div>;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px" }}>Month</th>
              <th style={{ padding: "12px 16px" }}>Gross Pay</th>
              <th style={{ padding: "12px 16px" }}>Deductions</th>
              <th style={{ padding: "12px 16px" }}>Net Pay</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {payroll.map((p) => {
              const deductions = p.deductions ?? p.totalDeductions ?? ((p.pf || 0) + (p.tax || 0));
              const net = (p.gross ?? p.salary ?? 0) - deductions;
              return (
                <tr key={p.id}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{formatPayrollMonth(p.month, p.year)}</td>
                  <td style={{ padding: "12px 16px" }}>{formatCurrency(p.gross ?? p.salary ?? 0)}</td>
                  <td style={{ padding: "12px 16px", color: "var(--accent-red)" }}>-{formatCurrency(deductions)}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--accent-green)" }}>{formatCurrency(net)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className="badge" style={{
                      background: p.status === "Paid" ? "var(--accent-green-dim)" : "var(--accent-amber-dim)",
                      color: p.status === "Paid" ? "var(--accent-green)" : "var(--accent-amber)",
                    }}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { role } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";

  useEffect(() => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    const fetchDocs = async () => {
      try {
        const q = isAdmin
          ? collection(db, "documents")
          : query(collection(db, "documents"), where("employeeId", "==", employeeId));
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d: any) => d.employeeId === employeeId || d.folderId === "3");
        setDocs(rows);
      } catch {
        setDocs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
  }, [employeeId, isAdmin]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={18} className="animate-spin" /> Loading documents…</div>;
  }

  if (docs.length === 0) {
    return <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No documents associated with this employee.</div>;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px" }}>Document Name</th>
              <th style={{ padding: "12px 16px" }}>Category / Type</th>
              <th style={{ padding: "12px 16px" }}>Date</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{d.name || d.title}</td>
                <td style={{ padding: "12px 16px" }}>{d.type || d.folder || "Document"}</td>
                <td style={{ padding: "12px 16px" }}>{d.date ? formatDate(d.date) : "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="badge badge-gray">{d.status || "Archived"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */
export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { role, user } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";

  const [emp,       setEmp]       = useState<Emp | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState("Overview");
  const [showEdit,  setShowEdit]  = useState(false);
  const [toggling,  setToggling]  = useState(false);

  /* ── Load employee from Firestore ── */
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "employees", id)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setEmp({
          id:             snap.id,
          uid:            d.uid            ?? "",
          employeeId:     d.employeeId     ?? "",
          firstName:      d.firstName      ?? "",
          lastName:       d.lastName       ?? "",
          email:          d.email          ?? "",
          phone:          d.phone          ?? "",
          dob:            d.dob            ?? "",
          gender:         d.gender         ?? "",
          address:        d.address        ?? "",
          department:     d.department     ?? "",
          designation:    d.designation    ?? "",
          joiningDate:    d.joiningDate    ?? "",
          employmentType: d.employmentType ?? "Full-time",
          salary:         d.salary         ?? 0,
          salaryDate:     d.salaryDate     ?? "",
          status:         d.status         ?? "Active",
          password:       d.password       ?? "",
          profileCompletion: d.profileCompletion ?? 0,
          companyId:      d.companyId      ?? "",
        });
      } else {
        toast.error("Employee not found");
        router.replace("/employees");
      }
      setLoading(false);
    }).catch(() => {
      toast.error("Failed to load employee");
      setLoading(false);
    });
  }, [id, router]);

  // SECURITY FIX [H5]: Verify employee can only view their own profile
  useEffect(() => {
    if (emp && !isAdmin && emp.uid !== user?.uid) {
      toast.error("Access denied: You can only view your own profile.");
      router.replace("/dashboard");
    }
  }, [emp, isAdmin, user?.uid, router]);

  /* ── Toggle Active / Inactive ── */
  const handleToggleStatus = async () => {
    if (!emp || !isAdmin) return;
    const newStatus = emp.status === "Active" ? "Inactive" : "Active";
    setToggling(true);
    try {
      await updateDoc(doc(db, "employees", emp.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      setEmp((p) => p ? { ...p, status: newStatus } : p);
      toast.success(`${emp.firstName} ${newStatus === "Active" ? "activated" : "deactivated"} successfully`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setToggling(false);
    }
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 12, color: "var(--text-muted)" }}>
        <Loader2 size={22} className="animate-spin" />
        <span style={{ fontSize: 14 }}>Loading employee…</span>
      </div>
    );
  }

  if (!emp) return null;

  const isActive = emp.status === "Active";
  const profileComp = emp.profileCompletion ?? calculateProfileCompletion(emp);

  return (
    <div className="page-container">
      {/* Edit modal */}
      {showEdit && (
        <EditModal
          emp={emp}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setEmp(updated)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => router.back()}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ textTransform: "uppercase" }}>
            {emp.firstName} {emp.lastName}
          </h1>
          <p className="page-subtitle">{emp.designation} · {emp.department}</p>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-secondary"
              style={{ gap: 6 }}
              onClick={() => setShowEdit(true)}
              id="emp-edit-btn"
            >
              <Edit2 size={14} /> Edit
            </button>
            <button
              className={`btn ${isActive ? "btn-danger" : "btn-primary"}`}
              style={{ gap: 6 }}
              onClick={handleToggleStatus}
              disabled={toggling}
              id="emp-toggle-btn"
            >
              {toggling
                ? <Loader2 size={14} className="animate-spin" />
                : isActive ? <UserX size={14} /> : <UserCheck size={14} />}
              {toggling ? "Updating…" : isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="emp-profile-grid" style={{ display: "grid", gap: 20 }}>
        {/* Left sidebar */}
        <div>
          {/* Avatar card */}
          <div className="card" style={{ padding: 24, textAlign: "center", marginBottom: 14 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: isActive ? "var(--accent-blue-dim)" : "rgba(9,9,9,0.08)",
              border: `2px solid ${isActive ? "var(--accent-blue)" : "var(--border-strong)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 700,
              color: isActive ? "var(--accent-blue)" : "var(--text-muted)",
              margin: "0 auto 12px",
            }}>
              {getInitials(`${emp.firstName} ${emp.lastName}`)}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{emp.firstName} {emp.lastName}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{emp.employeeId}</div>
            <span
              className="badge"
              style={{
                background: isActive ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
                color:      isActive ? "var(--accent-green)"     : "var(--accent-red)",
              }}
            >
              {emp.status}
            </span>
            
            <div style={{ marginTop: 20, textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Profile</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-blue)" }}>{profileComp}%</div>
              </div>
              <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${profileComp}%`, background: "var(--accent-blue)", borderRadius: 3 }} />
              </div>
            </div>
          </div>

          {/* Contact info card */}
          <div className="card" style={{ padding: 16 }}>
            {[
              { icon: Mail,       label: "Email",      value: emp.email,                   href: `mailto:${emp.email}` },
              { icon: Phone,      label: "Phone",      value: emp.phone,                   href: `tel:${emp.phone}` },
              { icon: MapPin,     label: "Address",    value: emp.address,                 href: undefined },
              { icon: Building2,  label: "Department", value: emp.department,              href: undefined },
              { icon: Calendar,   label: "Joining",    value: emp.joiningDate ? formatDate(emp.joiningDate) : "—", href: undefined },
              { icon: DollarSign, label: "Salary",     value: formatCurrency(emp.salary),  href: undefined },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", gap: 10, marginBottom: 13 }}>
                <item.icon size={13} color="var(--text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 1 }}>{item.label}</div>
                  {item.href ? (
                    <a href={item.href} style={{ fontSize: 13, color: "var(--text-primary)", textDecoration: "none" }}>{item.value || "—"}</a>
                  ) : (
                    <div style={{ fontSize: 13 }}>{item.value || "—"}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "9px 14px",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? "var(--brand-red)" : "var(--text-secondary)",
                  borderBottom: `2px solid ${tab === t ? "var(--brand-red)" : "transparent"}`,
                  marginBottom: -1, whiteSpace: "nowrap",
                  transition: "color 0.15s",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "Overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  ["Employment Type", emp.employmentType],
                  ["Gender",          emp.gender || "—"],
                  ["Date of Birth",   emp.dob ? formatDate(emp.dob) : "—"],
                  ["Work Email",      emp.email],
                  ["Department",      emp.department],
                  ["Designation",     emp.designation],
                  ["Joining Date",    emp.joiningDate ? formatDate(emp.joiningDate) : "—"],
                  ["Monthly Salary",  formatCurrency(emp.salary)],
                  ["Salary Date",     formatSalaryDateDisplay(emp.salaryDate)],
                ].map(([l, v]) => (
                  <div key={l} className="card" style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{l}</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
              {emp.salaryDate && <AdjustedPaymentCard employeeId={emp.employeeId} salaryDate={emp.salaryDate} />}
            </div>
          )}

          {tab === "Attendance" && <EmployeeAttendanceTab employeeId={emp.employeeId} />}
          {tab === "Tasks"      && <EmployeeTasksTab emp={emp} />}
          {tab === "Leaves"     && <EmployeeLeavesTab employeeId={emp.employeeId} uid={emp.uid} />}
          {tab === "Payroll"    && <EmployeePayrollTab employeeId={emp.employeeId} />}
          {tab === "Documents"  && <EmployeeDocumentsTab employeeId={emp.employeeId} />}
          {tab === "Activity"   && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Activity History</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Employee Profile Created:</span> {emp.joiningDate ? formatDate(emp.joiningDate) : "—"}
                </div>
                <div style={{ padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Account Status:</span> {emp.status}
                </div>
                <div style={{ padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Department:</span> {emp.department} · {emp.designation}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
