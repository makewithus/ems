import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, fmt = "MMM d, yyyy") {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy h:mm a");
}

export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatDeadlineHealth(deadline: string | Date | undefined | null) {
  if (!deadline) return null;
  const d = typeof deadline === "string" ? parseISO(deadline) : deadline;
  if (isNaN(d.getTime())) return null;

  const now = new Date();
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dDate.getTime() - nDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      status: "overdue" as const,
      label: days === 1 ? "Overdue by 1 day" : `Overdue by ${days} days`,
      days,
    };
  }
  if (diffDays === 0) {
    return {
      status: "today" as const,
      label: "Due Today",
      days: 0,
    };
  }
  return {
    status: "upcoming" as const,
    label: diffDays === 1 ? "Due Tomorrow" : `Due in ${diffDays} days`,
    days: diffDays,
  };
}

export function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Safely parses any time string (12-hour e.g. "09:30 AM", "6:15 PM" or 24-hour e.g. "09:30", "18:15")
 * into total minutes from midnight (0..1439). Returns null if invalid or NaN.
 */
export function parseTimeToMinutes(t: string | undefined | null): number | null {
  if (!t || t === "—" || typeof t !== "string") return null;
  const trimmed = t.trim();
  if (trimmed.includes("NaN")) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(am|pm)?$/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m)) return null;

  const mer = match[3]?.toUpperCase();
  if (mer === "PM" && h < 12) {
    h += 12;
  } else if (mer === "AM" && h === 12) {
    h = 0;
  }

  return h * 60 + m;
}

/**
 * Formats any time string (24h or 12h) to standardized 12-hour format "hh:mm AM/PM".
 * Returns "—" if empty, null, or invalid. Never outputs NaN.
 */
export function fmt24to12(t: string | undefined | null): string {
  if (!t || t === "—" || typeof t !== "string") return "—";
  if (t.includes("NaN")) return "—";

  const match = t.trim().match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(am|pm)?$/i);
  if (!match) return t;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m)) return "—";

  const mer = match[3]?.toUpperCase();
  if (mer === "PM" && h < 12) {
    h += 12;
  } else if (mer === "AM" && h === 12) {
    h = 0;
  }

  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatNumber(num: number) {
  return new Intl.NumberFormat("en-IN").format(num);
}

export function generateEmployeeId(count: number) {
  return `EMP${String(count + 1).padStart(4, "0")}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export function capitalizeFirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function slugify(str: string) {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

export function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export function getFileIcon(ext: string) {
  const map: Record<string, string> = {
    pdf: "PDF",
    doc: "DOC",
    docx: "DOCX",
    xls: "XLS",
    xlsx: "XLSX",
    jpg: "IMG",
    jpeg: "IMG",
    png: "IMG",
    zip: "ZIP",
    default: "FILE",
  };
  return map[ext.toLowerCase()] ?? map.default;
}

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  HR_ADMIN: "hr_admin",
  EMPLOYEE: "employee",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const DEPARTMENTS = [
  "Engineering",
  "Human Resources",
  "Finance",
  "Marketing",
  "Operations",
  "Sales",
  "Design",
  "Legal",
  "Customer Support",
  "Management",
] as const;

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Intern",
  "Freelance",
] as const;

export const LEAVE_TYPES = [
  "Casual",
  "Medical",
  "Emergency",
  "Paid",
  "Unpaid",
] as const;

export const LEAVE_STATUS = ["Pending", "Approved", "Rejected", "Cancelled"] as const;

export const TASK_STATUS = [
  "Pending",
  "In Progress",
  "Under Review",
  "Review",
  "Completed",
  "Cancelled",
] as const;

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent", "Critical"] as const;

export const NOTICE_PRIORITY = ["Low", "Normal", "High", "Urgent", "Critical"] as const;

export function normalizeNoticePriority(p: string | undefined | null): "Low" | "Normal" | "High" | "Urgent" | "Critical" {
  if (!p) return "Normal";
  const up = String(p).trim().toUpperCase();
  if (up === "LOW") return "Low";
  if (up === "NORMAL" || up === "MEDIUM") return "Normal";
  if (up === "HIGH") return "High";
  if (up === "URGENT") return "Urgent";
  if (up === "CRITICAL") return "Critical";
  return "Normal";
}

export function isValidUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "not-a-url") return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatPayrollMonth(month: any, year?: any): string {
  if (!month) return "—";
  if (typeof month === "number" || (!isNaN(Number(month)) && String(month).trim().length <= 2)) {
    const m = Number(month);
    const y = year && !isNaN(Number(year)) ? Number(year) : new Date().getFullYear();
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  const str = String(month).trim();
  if (/^\d{4}-\d{1,2}$/.test(str)) {
    const [y, m] = str.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  if (!isNaN(Date.parse(str))) {
    const d = new Date(str);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  return str;
}

export function computeHoursWorked(
  clockIn?: string,
  clockOut?: string,
  breakStart?: string,
  breakEnd?: string
): string {
  if (!clockIn || !clockOut) return "—";
  const inMins = parseTimeToMinutes(clockIn);
  const outMins = parseTimeToMinutes(clockOut);
  if (inMins === null || outMins === null || outMins <= inMins) return "—";

  let diff = outMins - inMins;

  // Deduct break if recorded
  if (breakStart && breakEnd) {
    const bStart = parseTimeToMinutes(breakStart);
    const bEnd = parseTimeToMinutes(breakEnd);
    if (bStart !== null && bEnd !== null && bEnd > bStart) {
      const bDuration = bEnd - bStart;
      diff = Math.max(0, diff - bDuration);
    }
  }

  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}

export function calculateProfileCompletion(data: {
  phone?: string;
  dob?: string;
  address?: string;
  emergencyContact?: { name?: string; phone?: string; relation?: string };
  department?: string;
  designation?: string;
}): number {
  if (!data) return 0;
  const fields = [
    data.phone,
    data.dob,
    data.address,
    data.emergencyContact?.name,
    data.emergencyContact?.phone,
    data.emergencyContact?.relation,
  ];
  const filled = fields.filter((f) => f && String(f).trim() !== "").length;
  return Math.round((filled / fields.length) * 100);
}

export const ATTENDANCE_STATUS = [
  "Present",
  "Absent",
  "Late",
  "Half Day",
  "Holiday",
  "Weekend",
] as const;
