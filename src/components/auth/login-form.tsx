"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Loader2, ArrowLeft, AlertCircle,
  ShieldCheck, User,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";
import { motion } from "framer-motion";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

/* ─────────────────── Shared sub-components ─────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block font-medium text-gray-600"
      style={{ fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}
    >
      {children}
    </label>
  );
}

function TextInput({
  id, type = "text", placeholder, disabled, error,
  rightSlot, ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string; rightSlot?: React.ReactNode;
}) {
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          {...rest}
          style={{
            width: "100%",
            padding: rightSlot ? "12px 42px 12px 14px" : "12px 14px",
            background: "transparent",
            border: `1px solid ${error ? "var(--brand-red)" : "var(--border-strong)"}`,
            borderRadius: 0,
            fontSize: 14,
            color: "var(--text-primary)",
            outline: "none",
            transition: "border-color 0.15s",
            fontFamily: "inherit",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--text-primary)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--brand-red)" : "var(--border-strong)";
          }}
        />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      {error && (
        <p style={{ fontSize: 12, color: "var(--brand-red)", marginTop: 5 }}>{error}</p>
      )}
    </div>
  );
}

function SubmitButton({
  loading, label, loadingLabel,
}: {
  loading: boolean; label: string; loadingLabel: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      type="submit"
      disabled={loading}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: loading ? "var(--text-muted)" : "var(--bg-dark)",
        color: "var(--text-inverse)",
        padding: "14px 16px",
        borderRadius: 0,
        border: "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "background 0.15s",
        fontFamily: "inherit",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
      onMouseOver={(e) => !loading && (e.currentTarget.style.background = "var(--brand-red)")}
      onMouseOut={(e) => !loading && (e.currentTarget.style.background = "var(--bg-dark)")}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {loading ? loadingLabel : label}
    </motion.button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-none"
      style={{
        background: "transparent",
        border: "1px solid var(--brand-red)",
        padding: "12px 14px",
        marginBottom: 22,
      }}
    >
      <AlertCircle size={15} style={{ color: "var(--brand-red)", flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: "var(--brand-red)", lineHeight: 1.45 }}>{message}</span>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/login"
      className="flex items-center gap-1.5 transition-colors w-fit"
      style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 32, textTransform: "uppercase", letterSpacing: "0.05em" }}
      onMouseOver={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
      onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
    >
      <ArrowLeft size={13} />
      Back
    </Link>
  );
}

/* ─────────────────── ADMIN LOGIN ─────────────────── */

const adminSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  remember: z.boolean().optional(),
});
type AdminFormData = z.infer<typeof adminSchema>;

export function AdminLoginForm() {
  const { signIn } = useAuthStore();
  const [showPass, setShowPass] = useState(false);
  const [serverError, setServerError] = useState("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<AdminFormData>({ resolver: zodResolver(adminSchema) });

  const onSubmit = async (data: AdminFormData) => {
    setServerError("");
    try {
      await signIn(data.email, data.password, "admin");
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      if (raw.includes("invalid-credential") || raw.includes("wrong-password") || raw.includes("user-not-found")) {
        setServerError("Incorrect email or password. Please try again.");
      } else {
        setServerError(raw || "Login failed. Please try again.");
      }
    }
  };

  return (
    <div className="w-full">
      <BackLink />

      {/* Portal badge */}
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck size={18} style={{ color: "var(--text-primary)" }} strokeWidth={1.5} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ADMIN PORTAL
        </span>
      </div>

      <h1
        style={{
          fontSize: 32, fontWeight: 800, color: "var(--text-primary)",
          letterSpacing: "-0.04em", marginBottom: 6, lineHeight: 1.1,
          textTransform: "uppercase",
        }}
      >
        Sign In
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.5 }}>
        Enter your admin credentials to manage the system.
      </p>

      {serverError && <ErrorBanner message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Email */}
          <div>
            <FieldLabel>Email address</FieldLabel>
            <TextInput
              id="admin-email"
              type="email"
              placeholder="admin@company.com"
              disabled={isSubmitting}
              error={errors.email?.message}
              {...register("email")}
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <FieldLabel>Password</FieldLabel>
              <Link
                href="/forgot-password"
                style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Forgot?
              </Link>
            </div>
            <TextInput
              id="admin-password"
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              disabled={isSubmitting}
              error={errors.password?.message}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 0 }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              {...register("password")}
            />
          </div>

          {/* Remember */}
          <div className="flex items-center gap-2.5" style={{ paddingTop: 4 }}>
            <input
              id="admin-remember"
              type="checkbox"
              {...register("remember")}
              style={{ width: 14, height: 14, accentColor: "var(--text-primary)", cursor: "pointer" }}
            />
            <label
              htmlFor="admin-remember"
              style={{ fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}
            >
              Keep me signed in
            </label>
          </div>

          <div style={{ marginTop: 8 }}>
            <SubmitButton
              loading={isSubmitting}
              label="Authenticate"
              loadingLabel="Verifying…"
            />
          </div>
        </div>
      </form>
    </div>
  );
}

/* ─────────────────── EMPLOYEE LOGIN ─────────────────── */

const employeeSchema = z.object({
  identifier: z.string().min(1, "This field is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type EmployeeFormData = z.infer<typeof employeeSchema>;

export function EmployeeLoginForm() {
  const { signIn } = useAuthStore();
  const [showPass, setShowPass] = useState(false);
  const [serverError, setServerError] = useState("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<EmployeeFormData>({ resolver: zodResolver(employeeSchema) });

  const onSubmit = async (data: EmployeeFormData) => {
    setServerError("");
    try {
      let targetEmail = data.identifier;
      let signedIn = false;
      let lastError;
      
      const isEmployeeId = !data.identifier.includes("@");

      if (isEmployeeId) {
        // Look up the employee's actual login email from Firestore first
        try {
          const empSnap = await getDocs(
            query(collection(db, "employees"), where("employeeId", "==", data.identifier.toUpperCase()))
          );
          if (!empSnap.empty) {
            const empEmail = empSnap.docs[0].data().email;
            if (empEmail) {
              try {
                await signIn(empEmail, data.password, "employee");
                targetEmail = empEmail;
                signedIn = true;
              } catch (err: any) {
                lastError = err;
                const errStr = err.message || err.code || "";
                if (!errStr.includes("invalid-credential") && !errStr.includes("wrong-password") && !errStr.includes("user-not-found")) {
                  throw err; // non-auth errors (like admin portal error) — stop immediately
                }
              }
            }
          }
        } catch (lookupErr: any) {
          // If Firestore lookup fails or threw a re-thrown error, propagate non-auth errors
          if (lookupErr.message?.includes("admin account")) throw lookupErr;
          // Otherwise silently fall through to direct email attempts
        }

        // Fallback: try direct email patterns if Firestore lookup didn't succeed
        if (!signedIn) {
          const baseId = data.identifier.toLowerCase().replace(/\s+/g, '');
          const emailsToTry = [
            `${baseId}@makewithus.in`,
            `${baseId}@mwu-ems.app`,
          ];
          for (const currentEmail of emailsToTry) {
            try {
              await signIn(currentEmail, data.password, "employee");
              targetEmail = currentEmail;
              signedIn = true;
              break;
            } catch (err: any) {
              lastError = err;
              const errStr = err.message || err.code || "";
              if (!errStr.includes("invalid-credential") && !errStr.includes("wrong-password") && !errStr.includes("user-not-found")) {
                break;
              }
            }
          }
        }
      } else {
        // If logging in by email, just try once
        try {
          await signIn(targetEmail, data.password, "employee");
          signedIn = true;
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!signedIn) {
        throw lastError || new Error("auth/invalid-credential");
      }

      /* ── Check employee active status and prevent ghost accounts ── */
      try {
        const uid = useAuthStore.getState().user?.uid;
        if (uid) {
          // Check by uid field FIRST. If it fails, they are on a ghost account (because the real employee record was updated with a new UID)
          let empSnap = await getDocs(
            query(collection(db, "employees"), where("uid", "==", uid))
          );
          
          if (empSnap.empty) {
             // Ghost account (admin forced a reset and employee used old password)
             await useAuthStore.getState().signOut();
             setServerError("Incorrect credentials. Please try again.");
             return;
          }

          const empData = empSnap.docs[0].data();
          const empStatus = empData.status ?? "Active";
          if (empStatus === "Inactive" || empStatus === "Archived") {
            await useAuthStore.getState().signOut();
            setServerError("Your account has been deactivated. Please contact HR or your administrator.");
            return;
          }
        }
      } catch {
        // If Firestore check fails (e.g. network), allow login.
      }

      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      if (raw.includes("invalid-credential") || raw.includes("wrong-password")) {
        setServerError("Incorrect credentials. Please try again.");
      } else {
        setServerError(raw || "Login failed. Please try again.");
      }
    }
  };

  return (
    <div className="w-full">
      <BackLink />

      {/* Portal badge */}
      <div className="flex items-center gap-2 mb-6">
        <User size={18} style={{ color: "var(--text-primary)" }} strokeWidth={1.5} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          EMPLOYEE PORTAL
        </span>
      </div>

      <h1
        style={{
          fontSize: 32, fontWeight: 800, color: "var(--text-primary)",
          letterSpacing: "-0.04em", marginBottom: 6, lineHeight: 1.1,
          textTransform: "uppercase",
        }}
      >
        Sign In
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.5 }}>
        Access your attendance, leave, and payslips.
      </p>

      {serverError && <ErrorBanner message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Identifier Input */}
          <div>
            <FieldLabel>Login Email (or Employee ID)</FieldLabel>
            <TextInput
              id="emp-identifier"
              type="text"
              placeholder="name@makewithus.in or EMP0001"
              disabled={isSubmitting}
              error={errors.identifier?.message}
              {...register("identifier")}
            />
          </div>

          <div>
            <FieldLabel>Password</FieldLabel>
            <TextInput
              id="emp-password"
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              disabled={isSubmitting}
              error={errors.password?.message}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 0 }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              {...register("password")}
            />
          </div>

          <div style={{ marginTop: 8 }}>
            <SubmitButton
              loading={isSubmitting}
              label="Authenticate"
              loadingLabel="Verifying…"
            />
          </div>
        </div>
      </form>
    </div>
  );
}
