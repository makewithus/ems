import { parseTimeToMinutes } from "@/lib/utils";

/**
 * Authoritative Attendance Reconciliation & Classification Service
 * 
 * Provides:
 * 1. Headcount Reconciliation (A-36)
 * 2. Login Streak Calculation (NEW-01)
 * 3. Configurable Attendance Threshold Policy & Classification (NEW-02)
 * 4. Realistic Seed Data Generator & Validator (E-08)
 */

export interface EmployeeInfo {
  id?: string;
  employeeId: string;
  status?: string;
  department?: string;
  firstName?: string;
  lastName?: string;
}

export interface AttendanceItem {
  id?: string;
  employeeId: string;
  date: string;
  status: string;
  department?: string;
  clockIn?: string;
  clockOut?: string;
  breakStart?: string;
  breakEnd?: string;
  hoursWorked?: string;
  notes?: string;
}

export interface LeaveItem {
  id?: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
  leaveType?: string;
}

export interface AttendanceReconciliation {
  date: string;
  totalHeadcount: number;
  present: number;
  late: number;
  halfDay: number;
  onLeave: number;
  weeklyOff: number;
  absent: number;
  // Summary aggregations
  totalPresent: number; // present + late + halfDay
  eligibleWorkforce: number; // totalHeadcount - onLeave - weeklyOff
  reconciliationCheckPassed: boolean;
}

/**
 * Returns date in YYYY-MM-DD format using local calendar date (avoids UTC timezone shift).
 */
export function toLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Configurable Attendance Policy Thresholds (NEW-02)
 */
export interface AttendanceThresholdPolicy {
  fullDayMinutes: number;              // Threshold for Present/Late (default 480 mins = 8h)
  halfDayMinutes: number;             // Threshold to qualify for Half Day (default 240 mins = 4h)
  minimumWorkMinutesForHalfDay: number; // Absolute minimum to avoid Absent (default 240 mins)
  workStartMinutes: number;            // Standard start time in minutes (default 09:00 = 540)
  lateGraceMinutes: number;            // Grace period in minutes (default 15 mins = 09:15)
  supportOvernightShifts: boolean;     // Whether shifts crossing midnight are supported
}

export const DEFAULT_ATTENDANCE_POLICY: AttendanceThresholdPolicy = {
  fullDayMinutes: 480,
  halfDayMinutes: 240,
  minimumWorkMinutesForHalfDay: 240,
  workStartMinutes: 9 * 60, // 09:00 AM
  lateGraceMinutes: 15,     // 15 mins grace period
  supportOvernightShifts: true,
};

/**
 * Computes net worked minutes between clockIn and clockOut, deducting recorded breaks.
 * Correctly handles overnight shifts when outMins < inMins.
 */
export function computeNetWorkedMinutes({
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  supportOvernight = true,
}: {
  clockIn?: string | null;
  clockOut?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  supportOvernight?: boolean;
}): { netMinutes: number; grossMinutes: number; breakMinutes: number; isValid: boolean } {
  if (!clockIn || !clockOut) {
    return { netMinutes: 0, grossMinutes: 0, breakMinutes: 0, isValid: false };
  }

  const inM = parseTimeToMinutes(clockIn);
  const outM = parseTimeToMinutes(clockOut);

  if (inM === null || outM === null) {
    return { netMinutes: 0, grossMinutes: 0, breakMinutes: 0, isValid: false };
  }

  let gross = outM - inM;
  if (gross < 0) {
    if (supportOvernight) {
      gross += 24 * 60; // 1440 mins
    } else {
      return { netMinutes: 0, grossMinutes: 0, breakMinutes: 0, isValid: false };
    }
  }

  let breakDuration = 0;
  if (breakStart && breakEnd) {
    const bs = parseTimeToMinutes(breakStart);
    const be = parseTimeToMinutes(breakEnd);
    if (bs !== null && be !== null) {
      let bDiff = be - bs;
      if (bDiff < 0 && supportOvernight) {
        bDiff += 24 * 60;
      }
      if (bDiff > 0) {
        breakDuration = bDiff;
      }
    }
  }

  const net = Math.max(0, gross - breakDuration);
  return { netMinutes: net, grossMinutes: gross, breakMinutes: breakDuration, isValid: true };
}

export interface ClassificationResult {
  status: "Present" | "Late" | "Half Day" | "Absent";
  hoursWorked: string;
  netMinutes: number;
  notes: string;
}

/**
 * Centralized Attendance Classification Service (NEW-02)
 * 
 * Rules:
 * 1. Missing clock-out -> Active / Pending Clock-Out (Preserves clock-in state)
 * 2. Net duration < halfDayMinutes (e.g. 1 min or < 240 mins) -> NEVER Half Day, classified as Absent
 * 3. Net duration between halfDayMinutes and fullDayMinutes -> Half Day
 * 4. Net duration >= fullDayMinutes -> Present (on-time arrival) or Late (arrived after grace period)
 */
export function classifyAttendanceRecord({
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  policy = DEFAULT_ATTENDANCE_POLICY,
}: {
  clockIn?: string | null;
  clockOut?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  policy?: AttendanceThresholdPolicy;
}): ClassificationResult {
  if (!clockIn) {
    return {
      status: "Absent",
      hoursWorked: "—",
      netMinutes: 0,
      notes: "No clock-in recorded",
    };
  }

  const inM = parseTimeToMinutes(clockIn);
  if (inM === null) {
    return {
      status: "Absent",
      hoursWorked: "—",
      netMinutes: 0,
      notes: "Invalid clock-in format",
    };
  }

  // Active shift with missing clock-out
  if (!clockOut) {
    const isLateArrival = inM > policy.workStartMinutes + policy.lateGraceMinutes;
    return {
      status: isLateArrival ? "Late" : "Present",
      hoursWorked: "In Progress",
      netMinutes: 0,
      notes: "Active (Pending Clock-Out)",
    };
  }

  const { netMinutes, isValid } = computeNetWorkedMinutes({
    clockIn,
    clockOut,
    breakStart,
    breakEnd,
    supportOvernight: policy.supportOvernightShifts,
  });

  const h = Math.floor(netMinutes / 60);
  const m = netMinutes % 60;
  const hoursWorked = `${h}h ${m}m`;

  if (!isValid) {
    return {
      status: "Absent",
      hoursWorked: "—",
      netMinutes: 0,
      notes: "Invalid attendance timings",
    };
  }

  // NEW-02 FIX: Net duration below half-day threshold (e.g. 1 minute or < 240 mins)
  // MUST NEVER qualify as Half Day! It is classified as Absent.
  if (netMinutes < policy.halfDayMinutes) {
    return {
      status: "Absent",
      hoursWorked,
      netMinutes,
      notes: `Short duration (${hoursWorked}) below half-day threshold (< ${Math.floor(policy.halfDayMinutes / 60)}h) — classified as Absent`,
    };
  }

  // Between half day and full day threshold
  if (netMinutes < policy.fullDayMinutes) {
    return {
      status: "Half Day",
      hoursWorked,
      netMinutes,
      notes: `Half Day (${hoursWorked} worked)`,
    };
  }

  // Full day threshold met or exceeded
  const isLateArrival = inM > policy.workStartMinutes + policy.lateGraceMinutes;
  return {
    status: isLateArrival ? "Late" : "Present",
    hoursWorked,
    netMinutes,
    notes: isLateArrival ? `Late arrival full day (${hoursWorked})` : `Full day (${hoursWorked})`,
  };
}

/**
 * Centralized Login Streak Calculation Service (NEW-01)
 * 
 * Rules:
 * 1. Clocking in today does NOT reset the streak; it increments it.
 * 2. Half-day or short-day attendance does NOT reset the streak.
 * 3. Weekly offs (weekends) and company holidays bridge the streak without breaking it.
 * 4. Deduplicates multiple clock-ins on the same day.
 * 5. Handles timezone and date boundary transitions cleanly using local dates.
 */
export interface LoginStreakOptions {
  currentDate?: Date | string;
  holidays?: string[];
  weeklyOffDays?: number[];
  lookbackDays?: number;
}

export function calculateLoginStreak(
  records: Array<{ date?: string; status?: string; clockIn?: string }>,
  options: LoginStreakOptions = {}
): number {
  if (!records || records.length === 0) return 0;

  const weeklyOffs = new Set(options.weeklyOffDays ?? [0, 6]);
  const holidaySet = new Set(options.holidays ?? []);
  const maxDays = options.lookbackDays ?? 90;

  // Deduplicate records by date
  const recordMap = new Map<string, { status?: string; clockIn?: string }>();
  for (const r of records) {
    if (r.date) {
      const existing = recordMap.get(r.date);
      // Give precedence to records with attendance presence
      if (
        !existing ||
        r.status === "Present" ||
        r.status === "Late" ||
        r.status === "Half Day" ||
        Boolean(r.clockIn)
      ) {
        recordMap.set(r.date, r);
      }
    }
  }

  const today = options.currentDate
    ? (typeof options.currentDate === "string"
        ? new Date(options.currentDate + "T00:00:00")
        : new Date(options.currentDate))
    : new Date();

  let streak = 0;

  for (let i = 0; i < maxDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const dateStr = toLocalDateString(d);
    const rec = recordMap.get(dateStr);
    const dayOfWeek = d.getDay();
    const isWeeklyOff = weeklyOffs.has(dayOfWeek);
    const isHoliday = holidaySet.has(dateStr);

    // Any valid attendance (Present, Late, Half Day, or presence of clockIn) maintains streak!
    const hasAttended = rec && (
      rec.status === "Present" ||
      rec.status === "Late" ||
      rec.status === "Half Day" ||
      Boolean(rec.clockIn)
    );

    if (hasAttended) {
      streak++;
    } else if (isWeeklyOff || isHoliday) {
      // Weekend / Holiday without work bridges the streak
      continue;
    } else if (i === 0 && !rec) {
      // Today before the employee has clocked in:
      // Don't break streak for previous days!
      continue;
    } else {
      // Unexcused absence on a working day breaks the streak
      break;
    }
  }

  return streak;
}

/**
 * Realistic Attendance Seed Generator (E-08)
 * 
 * Generates varied, authentic attendance data:
 * - Varied clock-in (08:48-09:27) and clock-out (17:45-18:34)
 * - Weekends are NOT marked "Present" (categorized as "Weekend" / Weekly Off)
 * - Holidays are marked "Holiday" (never "Absent")
 * - Idempotent deterministic document keying prevents duplicates
 */
export interface SeedAttendanceRecord {
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  clockIn: string;
  clockOut: string;
  breakStart: string;
  breakEnd: string;
  hoursWorked: string;
  status: "Present" | "Late" | "Weekend" | "Holiday" | "Absent" | "Half Day";
  notes?: string;
  isSeedData: boolean;
}

export function generateRealisticAttendanceSeed({
  employeeId,
  employeeName,
  department = "Engineering",
  startDateStr,
  endDateStr,
  weeklyOffDays = [0, 6],
  holidays = [],
  seedSalt = 42,
}: {
  employeeId: string;
  employeeName: string;
  department?: string;
  startDateStr: string;
  endDateStr: string;
  weeklyOffDays?: number[];
  holidays?: string[];
  seedSalt?: number;
}): SeedAttendanceRecord[] {
  const records: SeedAttendanceRecord[] = [];
  const start = new Date(startDateStr + "T00:00:00");
  const end = new Date(endDateStr + "T00:00:00");
  const holidaySet = new Set(holidays);
  const weeklyOffSet = new Set(weeklyOffDays);

  let current = new Date(start);
  let dayIndex = 0;

  while (current <= end) {
    const dateStr = toLocalDateString(current);
    const dayOfWeek = current.getDay();
    const isWeekend = weeklyOffSet.has(dayOfWeek);
    const isHoliday = holidaySet.has(dateStr);

    dayIndex++;
    const hash = (seedSalt + dayIndex * 13 + employeeId.charCodeAt(0) * 17) % 100;

    if (isHoliday) {
      records.push({
        employeeId,
        employeeName,
        department,
        date: dateStr,
        clockIn: "",
        clockOut: "",
        breakStart: "",
        breakEnd: "",
        hoursWorked: "—",
        status: "Holiday",
        notes: "Public Holiday",
        isSeedData: true,
      });
    } else if (isWeekend) {
      records.push({
        employeeId,
        employeeName,
        department,
        date: dateStr,
        clockIn: "",
        clockOut: "",
        breakStart: "",
        breakEnd: "",
        hoursWorked: "—",
        status: "Weekend",
        notes: "Weekly Off",
        isSeedData: true,
      });
    } else {
      const inMinute = 48 + (hash % 40); // 08:48 to 09:27
      const inHour = Math.floor(inMinute / 60) + 8;
      const inMinRem = inMinute % 60;
      const clockIn = `${String(inHour).padStart(2, "0")}:${String(inMinRem).padStart(2, "0")}`;

      const outMinute = 45 + ((hash * 7) % 50); // 17:45 to 18:34
      const outHour = Math.floor(outMinute / 60) + 17;
      const outMinRem = outMinute % 60;
      const clockOut = `${String(outHour).padStart(2, "0")}:${String(outMinRem).padStart(2, "0")}`;

      const breakDuration = 35 + ((hash * 3) % 25);
      const breakStart = "13:00";
      const breakEnd = `13:${String(breakDuration).padStart(2, "0")}`;

      const classification = classifyAttendanceRecord({
        clockIn,
        clockOut,
        breakStart,
        breakEnd,
      });

      records.push({
        employeeId,
        employeeName,
        department,
        date: dateStr,
        clockIn,
        clockOut,
        breakStart,
        breakEnd,
        hoursWorked: classification.hoursWorked,
        status: classification.status,
        notes: classification.notes,
        isSeedData: true,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return records;
}

/**
 * Authoritatively reconciles attendance for a given date across the entire workforce.
 */
export function reconcileAttendanceForDate({
  employees,
  attendanceRecords,
  approvedLeaves,
  dateStr,
  isWeekendOrHoliday,
}: {
  employees: EmployeeInfo[];
  attendanceRecords: AttendanceItem[];
  approvedLeaves: LeaveItem[];
  dateStr: string;
  isWeekendOrHoliday?: boolean;
}): AttendanceReconciliation {
  // 1. Filter to active workforce (exclude archived/inactive if policy states active headcount)
  const activeEmployees = employees.filter(
    (e) => e.status !== "Archived" && e.employeeId
  );
  const totalHeadcount = activeEmployees.length;

  // 2. Determine calendar day type (weekend vs business day)
  let isWeekend = isWeekendOrHoliday;
  if (isWeekend === undefined) {
    const day = new Date(dateStr + "T00:00:00").getDay();
    isWeekend = day === 0 || day === 6; // Sunday or Saturday
  }

  // 3. Map records by employeeId for O(1) lookup
  const attendanceMap = new Map<string, AttendanceItem>();
  for (const record of attendanceRecords) {
    if (record.employeeId && (!record.date || record.date === dateStr)) {
      attendanceMap.set(record.employeeId, record);
    }
  }

  // 4. Map active approved leaves for O(1) lookup
  const leaveMap = new Set<string>();
  for (const leave of approvedLeaves) {
    if (
      leave.employeeId &&
      leave.status === "Approved" &&
      leave.startDate &&
      leave.endDate &&
      dateStr >= leave.startDate &&
      dateStr <= leave.endDate
    ) {
      leaveMap.add(leave.employeeId);
    }
  }

  // 5. Partition employees into mutually exclusive categories
  let present = 0;
  let late = 0;
  let halfDay = 0;
  let onLeave = 0;
  let weeklyOff = 0;
  let absent = 0;

  for (const emp of activeEmployees) {
    const record = attendanceMap.get(emp.employeeId);

    if (record) {
      const s = record.status;
      if (s === "Present") {
        present++;
      } else if (s === "Late") {
        late++;
      } else if (s === "Half Day") {
        halfDay++;
      } else if (s === "Absent") {
        absent++;
      } else if (s === "Holiday" || s === "Weekend") {
        weeklyOff++;
      } else {
        // Unknown logged status with clockIn defaults to present
        present++;
      }
    } else {
      // No attendance logged
      if (leaveMap.has(emp.employeeId)) {
        onLeave++;
      } else if (isWeekend) {
        weeklyOff++;
      } else {
        absent++;
      }
    }
  }

  const totalPresent = present + late + halfDay;
  const eligibleWorkforce = Math.max(0, totalHeadcount - onLeave - weeklyOff);
  const sumOfCategories = present + late + halfDay + onLeave + weeklyOff + absent;
  const reconciliationCheckPassed = sumOfCategories === totalHeadcount;

  return {
    date: dateStr,
    totalHeadcount,
    present,
    late,
    halfDay,
    onLeave,
    weeklyOff,
    absent,
    totalPresent,
    eligibleWorkforce,
    reconciliationCheckPassed,
  };
}

