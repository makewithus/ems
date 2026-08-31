"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Edit2, UserCheck, UserX, Mail, Phone,
  MapPin, Building2, Calendar, DollarSign, Loader2,
  Save, X, ChevronDown, Eye, EyeOff, CalendarClock,
} from "lucide-react";
import { formatDate, getInitials, formatCurrency, EMPLOYMENT_TYPES } from "@/lib/utils";
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
      let passwordToSave = form.password || "";

      let finalUid = emp.uid;

      if (credentialsChanged) {
        // Update credentials in Auth
        const res = await updateEmployeeAuth(
          emp.email,
          emp.password || "",
          form.email,
          newPassword.trim() || undefined
        );
        updatedEmail = res.email;
        passwordToSave = newPassword.trim() || (emp.password || "");
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
        password:       passwordToSave,
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
        password: passwordToSave
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
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 12 }}>
              🔐 Portal Credentials
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
                Already Set Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showCurrentPass ? "text" : "password"}
                  className="input-base"
                  readOnly
                  value={emp.password || "Not set"}
                  style={{ color: "var(--text-muted)", paddingRight: 40, cursor: "text" }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "4px 6px" }}
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                >
                  {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
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

/* ── Adjusted Payment Date Card ──────────────────────────── */
function AdjustedPaymentCard({ employeeId, salaryDate }: { employeeId: string; salaryDate: string }) {
  const [absentCount, setAbsentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

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
    if (!salaryDate) return null;
    try {
      const base = new Date(salaryDate);
      if (isNaN(base.getTime())) return null;
      // Use the salary date's day-of-month in the current month/year
      const payDate = new Date(currentYear, currentMonth, base.getDate());
      payDate.setDate(payDate.getDate() + absentCount);
      return payDate;
    } catch {
      return null;
    }
  }, [salaryDate, absentCount, currentMonth, currentYear]);

  if (loading) return null;
  if (!adjustedDate) return null;

  const baseDayOfMonth = new Date(salaryDate).getDate();

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
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-blue)" }}>{emp.profileCompletion || 0}%</div>
              </div>
              <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${emp.profileCompletion || 0}%`, background: "var(--accent-blue)", borderRadius: 3 }} />
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
                  ["Salary Date",     emp.salaryDate ? formatDate(emp.salaryDate) : "—"],
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

          {tab !== "Overview" && (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{tab}</div>
              <div style={{ fontSize: 13 }}>Live {tab.toLowerCase()} data loads here from Firestore.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
