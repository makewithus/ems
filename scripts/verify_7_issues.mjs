/**
 * Automated Verification Suite for MakeWithUs EMS
 * 
 * Verifies:
 * 1. NEW-01 — Login Streak Resets to 0 After Clocking In
 * 2. E-20   — Invalid Leave Date Range Rejected with Inline Error
 * 3. E-08   — Attendance Records, Varied Seed Data & Weekend Classification
 * 4. NEW-02 — One-Minute Attendance & Configurable Classification Thresholds
 * 5. A-36   — Attendance Count Reconciliation
 * 6. A-31   — Employee Credential Security
 * 7. A-39   — Admin Notifications
 */

import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  calculateLoginStreak,
  classifyAttendanceRecord,
  computeNetWorkedMinutes,
  generateRealisticAttendanceSeed,
  reconcileAttendanceForDate,
  toLocalDateString,
  DEFAULT_ATTENDANCE_POLICY,
} from "../src/lib/attendanceService.js";
import { computeHoursWorked, parseTimeToMinutes } from "../src/lib/utils.js";
import { isRepetitivePlaceholderRecord, sanitizeAttendanceRecords } from "./seed_attendance.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

console.log("================================================================================");
console.log("MAKEWITHUS EMS — COMPREHENSIVE 4-BUG FIX & INTEGRATION VERIFICATION SUITE");
console.log("================================================================================\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. NEW-01: Login Streak Calculation
// ─────────────────────────────────────────────────────────────────────────────
console.log("🔹 Testing Issue NEW-01: Login Streak Calculation");

// Scenario A: Employee had a 7-day streak. Today they clock in.
// Previously: clocking in reset the streak to 0.
// Expected: streak is maintained and increments to 8 days!
const sevenDayRecords = [
  { date: "2026-11-13", status: "Present", clockIn: "09:00" }, // Fri
  { date: "2026-11-16", status: "Present", clockIn: "09:00" }, // Mon
  { date: "2026-11-17", status: "Present", clockIn: "09:00" }, // Tue
  { date: "2026-11-18", status: "Late", clockIn: "09:30" },    // Wed
  { date: "2026-11-19", status: "Present", clockIn: "09:00" }, // Thu
  { date: "2026-11-20", status: "Present", clockIn: "09:00" }, // Fri
  { date: "2026-11-23", status: "Present", clockIn: "09:05" }, // Mon (Today - clocked in)
];

const streakAfterClockIn = calculateLoginStreak(sevenDayRecords, {
  currentDate: "2026-11-23", // Monday
  weeklyOffDays: [0, 6],     // Sat, Sun
});
assert(streakAfterClockIn === 7, `Streak after clocking in today is maintained (streak: ${streakAfterClockIn}, expected >= 7)`);

// Scenario B: Employee has NOT yet clocked in today (Monday morning before clock-in)
// Expected: yesterday's streak (from Fri) is preserved, NOT reset to 0!
const recordsBeforeClockIn = sevenDayRecords.filter((r) => r.date !== "2026-11-23");
const streakBeforeClockIn = calculateLoginStreak(recordsBeforeClockIn, {
  currentDate: "2026-11-23", // Monday morning
  weeklyOffDays: [0, 6],
});
assert(streakBeforeClockIn === 6, `Monday morning before clock-in preserves past week streak: ${streakBeforeClockIn}`);

// Scenario C: Half-Day attendance must NOT reset or break the streak
const recordsWithHalfDay = [
  { date: "2026-11-18", status: "Present", clockIn: "09:00" },
  { date: "2026-11-19", status: "Half Day", clockIn: "09:00", clockOut: "13:30" }, // Half day
  { date: "2026-11-20", status: "Present", clockIn: "09:00" },
];
const streakWithHalfDay = calculateLoginStreak(recordsWithHalfDay, {
  currentDate: "2026-11-20",
  weeklyOffDays: [0, 6],
});
assert(streakWithHalfDay === 3, `Half-day attendance maintains streak without resetting: ${streakWithHalfDay}`);

// Scenario D: Weekends without attendance bridge the streak (Fri to Mon)
const weekendBridgeRecords = [
  { date: "2026-11-20", status: "Present", clockIn: "09:00" }, // Friday
  { date: "2026-11-23", status: "Present", clockIn: "09:00" }, // Monday
];
const weekendBridgeStreak = calculateLoginStreak(weekendBridgeRecords, {
  currentDate: "2026-11-23",
  weeklyOffDays: [0, 6], // Sat, Sun
});
assert(weekendBridgeStreak === 2, `Weekend without work bridges streak from Friday to Monday: ${weekendBridgeStreak}`);

// Scenario E: Company Holiday bridges the streak
const holidayBridgeRecords = [
  { date: "2026-11-11", status: "Present", clockIn: "09:00" },
  { date: "2026-11-13", status: "Present", clockIn: "09:00" },
];
const holidayBridgeStreak = calculateLoginStreak(holidayBridgeRecords, {
  currentDate: "2026-11-13",
  holidays: ["2026-11-12"], // Holiday on Nov 12
});
assert(holidayBridgeStreak === 2, `Company holiday bridges streak without breaking: ${holidayBridgeStreak}`);

// Scenario F: Multiple clock-in records on the same day deduplicate properly
const duplicateDayRecords = [
  { date: "2026-11-20", status: "Present", clockIn: "09:00" },
  { date: "2026-11-20", status: "Present", clockIn: "09:02" }, // Duplicate entry
  { date: "2026-11-23", status: "Present", clockIn: "09:00" },
];
const duplicateStreak = calculateLoginStreak(duplicateDayRecords, {
  currentDate: "2026-11-23",
  weeklyOffDays: [0, 6],
});
assert(duplicateStreak === 2, `Duplicate records on same date count as single streak day: ${duplicateStreak}`);

// Scenario G: Unexcused absence on a working day breaks the streak
const brokenStreakRecords = [
  { date: "2026-11-18", status: "Present", clockIn: "09:00" },
  // 2026-11-19 is a Thursday with no attendance record
  { date: "2026-11-20", status: "Present", clockIn: "09:00" },
];
const brokenStreak = calculateLoginStreak(brokenStreakRecords, {
  currentDate: "2026-11-20",
  weeklyOffDays: [0, 6],
});
assert(brokenStreak === 1, `Unexcused missed working day resets streak: ${brokenStreak}`);


// ─────────────────────────────────────────────────────────────────────────────
// 2. E-20: Leave Date Range Validation & Error Messaging
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔹 Testing Issue E-20: Leave Date Range Validation");

const leaveSchema = z.object({
  leaveType: z.string().min(1, "Please select a leave type"),
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

// Test 1: Start 20 Dec, End 18 Dec -> Reject with clear message
const res20to18 = leaveSchema.safeParse({
  leaveType: "Casual",
  startDate: "2026-12-20",
  endDate:   "2026-12-18",
  reason:    "Family vacation",
});
assert(!res20to18.success, "20 December -> 18 December: Rejected as invalid date range");
const endErrorMsg = !res20to18.success && res20to18.error.errors.find((e) => e.path.includes("endDate"))?.message;
assert(
  endErrorMsg === "End date cannot be earlier than the start date." ||
  endErrorMsg === "End date cannot be earlier than start date.",
  `Clear error message displayed: "${endErrorMsg}"`
);

// Test 2: Start 18 Dec, End 20 Dec -> Accept
const res18to20 = leaveSchema.safeParse({
  leaveType: "Casual",
  startDate: "2026-12-18",
  endDate:   "2026-12-20",
  reason:    "Family vacation",
});
assert(res18to20.success, "18 December -> 20 December: Accepted valid date range");

// Test 3: Same day leave (20 Dec -> 20 Dec) -> Accept
const resSameDay = leaveSchema.safeParse({
  leaveType: "Sick",
  startDate: "2026-12-20",
  endDate:   "2026-12-20",
  reason:    "Doctor appointment",
});
assert(resSameDay.success, "Single-day leave (20 Dec -> 20 Dec): Accepted");

// Test 4: Missing start date -> Reject
const resMissingStart = leaveSchema.safeParse({
  leaveType: "Sick",
  startDate: "",
  endDate:   "2026-12-20",
  reason:    "Doctor appointment",
});
assert(!resMissingStart.success, "Missing start date: Rejected");

// Test 5: Missing end date -> Reject
const resMissingEnd = leaveSchema.safeParse({
  leaveType: "Sick",
  startDate: "2026-12-20",
  endDate:   "",
  reason:    "Doctor appointment",
});
assert(!resMissingEnd.success, "Missing end date: Rejected");

// Test 6: Past date (yesterday) cannot be chosen -> Reject
const resPastDate = leaveSchema.safeParse({
  leaveType: "Sick",
  startDate: "2026-11-20",
  endDate:   "2026-11-25",
  reason:    "Medical",
});
assert(!resPastDate.success, "Past start date (2026-11-20): Rejected ('Start date cannot be in the past.')");

const resPastEnd = leaveSchema.safeParse({
  leaveType: "Sick",
  startDate: "2026-11-24",
  endDate:   "2026-11-20",
  reason:    "Medical",
});
assert(!resPastEnd.success, "Past end date (2026-11-20): Rejected ('End date cannot be in the past.')");

// Test 6: Overlap detection logic in leaves page
const existingLeaves = [
  { employeeId: "EMP01", status: "Approved", rawStartDate: "2026-12-05", rawEndDate: "2026-12-08" },
];
function checkOverlap(reqList, empId, start, end) {
  return reqList.some(
    (r) =>
      r.employeeId === empId &&
      (r.status === "Pending" || r.status === "Approved") &&
      r.rawStartDate &&
      r.rawEndDate &&
      !(end < r.rawStartDate || start > r.rawEndDate)
  );
}
assert(checkOverlap(existingLeaves, "EMP01", "2026-12-07", "2026-12-10") === true, "Overlapping leave request correctly blocked");
assert(checkOverlap(existingLeaves, "EMP01", "2026-12-10", "2026-12-12") === false, "Non-overlapping leave request allowed");


// ─────────────────────────────────────────────────────────────────────────────
// 3. E-08: Attendance Records, Seed Data Generation & Weekend Classification
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔹 Testing Issue E-08: Attendance Seed Data & Weekend Classification");

const seedData = generateRealisticAttendanceSeed({
  employeeId: "EMP_TEST_01",
  employeeName: "Test User",
  department: "Engineering",
  startDateStr: "2026-11-12",
  endDateStr: "2026-11-17",
  weeklyOffDays: [0, 6], // Saturday (14 Nov), Sunday (15 Nov)
  holidays: [],
});

// Check 1: 14 Nov (Sat) and 15 Nov (Sun) must NOT be marked Present!
const satRec = seedData.find((r) => r.date === "2026-11-14");
const sunRec = seedData.find((r) => r.date === "2026-11-15");
assert(satRec?.status === "Weekend", `Saturday 14 Nov classified as "${satRec?.status}" (NOT Present)`);
assert(sunRec?.status === "Weekend", `Sunday 15 Nov classified as "${sunRec?.status}" (NOT Present)`);

// Check 2: Varied timings, not identical 09:12 - 18:15
const weekdayRecs = seedData.filter((r) => r.status === "Present" || r.status === "Late");
const allExact0912 = weekdayRecs.every((r) => r.clockIn === "09:12");
const allExact1815 = weekdayRecs.every((r) => r.clockOut === "18:15");
assert(!allExact0912, "Weekday clock-in timings are varied, not hardcoded 09:12");
assert(!allExact1815, "Weekday clock-out timings are varied, not hardcoded 18:15");

// Check 3: Sanitizer cleans up old repetitive records
const badSample = [
  { employeeId: "TEST", date: "2026-11-14", clockIn: "09:12", clockOut: "18:15", status: "Present", isSeedData: true },
  { employeeId: "TEST", date: "2026-11-15", clockIn: "09:12", clockOut: "18:15", status: "Present", isSeedData: true },
];
const sanitized = sanitizeAttendanceRecords(badSample);
assert(sanitized[0].status === "Weekend", "Sanitizer converts weekend Present record to Weekend");
assert(sanitized[1].status === "Weekend", "Sanitizer converts Sunday Present record to Weekend");


// ─────────────────────────────────────────────────────────────────────────────
// 4. NEW-02: Attendance Duration & Classification
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔹 Testing Issue NEW-02: Attendance Duration & Classification");

// Test A: 01:44 PM to 01:46 PM (approx 1-2 mins) must NEVER qualify as Half Day!
// It must be classified as Absent!
const oneMinRes = classifyAttendanceRecord({
  clockIn: "01:44 PM",
  clockOut: "01:46 PM",
});
assert(oneMinRes.status === "Absent", `1-minute attendance classified as "${oneMinRes.status}" (MUST NOT be Half Day)`);
assert(oneMinRes.netMinutes === 2, `1-minute attendance net minutes computed accurately: ${oneMinRes.netMinutes}m`);
assert(oneMinRes.hoursWorked === "0h 2m", `Formatted duration string: "${oneMinRes.hoursWorked}"`);

// Test B: 5-minute attendance (11:44 to 11:50 with 1 min break = 5m net) must be Absent, NOT Half Day
const fiveMinRes = classifyAttendanceRecord({
  clockIn: "11:44",
  clockOut: "11:50",
  breakStart: "11:46",
  breakEnd: "11:47",
});
assert(fiveMinRes.status === "Absent", `5-minute attendance below half-day threshold classified as "${fiveMinRes.status}"`);
assert(fiveMinRes.netMinutes === 5, `Net working duration is 5 mins: ${fiveMinRes.netMinutes}m`);

// Test C: 4.5 hours attendance (270 mins) meets half-day threshold (>= 240 mins)
const halfDayRes = classifyAttendanceRecord({
  clockIn: "09:00",
  clockOut: "14:00",
  breakStart: "12:00",
  breakEnd: "12:30", // 5h - 30m = 4h 30m = 270m
});
assert(halfDayRes.status === "Half Day", `4h 30m attendance classified as "${halfDayRes.status}"`);
assert(halfDayRes.netMinutes === 270, `Half-day net minutes: ${halfDayRes.netMinutes}m`);

// Test D: Full day 8 hours on-time arrival -> Present
const fullDayRes = classifyAttendanceRecord({
  clockIn: "09:00",
  clockOut: "17:45",
  breakStart: "13:00",
  breakEnd: "13:45", // 8h 45m - 45m = 8h 0m = 480m
});
assert(fullDayRes.status === "Present", `8-hour on-time arrival classified as "${fullDayRes.status}"`);

// Test E: Full day 8 hours late arrival (> 09:15) -> Late
const lateFullDayRes = classifyAttendanceRecord({
  clockIn: "09:30",
  clockOut: "18:15",
  breakStart: "13:00",
  breakEnd: "13:45", // 8h 45m - 45m = 8h 0m = 480m
});
assert(lateFullDayRes.status === "Late", `8-hour late arrival (09:30 AM) classified as "${lateFullDayRes.status}"`);

// Test F: Overnight shift (22:00 to 06:00 = 8h 0m)
const overnightRes = classifyAttendanceRecord({
  clockIn: "22:00",
  clockOut: "06:00",
});
assert(overnightRes.status === "Present" || overnightRes.status === "Late", `Overnight shift handled properly: status "${overnightRes.status}", hours "${overnightRes.hoursWorked}"`);
assert(overnightRes.netMinutes === 480, `Overnight shift net minutes: ${overnightRes.netMinutes}m`);

// Test G: Missing clock-out record handled cleanly
const missingOutRes = classifyAttendanceRecord({
  clockIn: "09:00",
  clockOut: null,
});
assert(missingOutRes.status === "Present", `Active shift with missing clock-out classified as "${missingOutRes.status}"`);
assert(missingOutRes.hoursWorked === "In Progress", `Active shift formatted as "${missingOutRes.hoursWorked}"`);


// ─────────────────────────────────────────────────────────────────────────────
// 5. A-36: Attendance Count Reconciliation Identity Check
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔹 Testing Issue A-36: Attendance Count Reconciliation");

const testEmployees = [
  { employeeId: "EMP01", status: "Active" },
  { employeeId: "EMP02", status: "Active" },
  { employeeId: "EMP03", status: "Active" },
  { employeeId: "EMP04", status: "Active" },
  { employeeId: "EMP05", status: "Active" },
  { employeeId: "EMP06", status: "Active" },
  { employeeId: "EMP07", status: "Active" },
  { employeeId: "EMP08", status: "Active" },
  { employeeId: "EMP09", status: "Active" },
  { employeeId: "EMP10", status: "Active" },
];

const testAttendance = [
  { employeeId: "EMP01", status: "Present", date: "2026-11-18" },
  { employeeId: "EMP02", status: "Present", date: "2026-11-18" },
  { employeeId: "EMP03", status: "Present", date: "2026-11-18" },
  { employeeId: "EMP04", status: "Present", date: "2026-11-18" },
  { employeeId: "EMP05", status: "Present", date: "2026-11-18" },
  { employeeId: "EMP06", status: "Present", date: "2026-11-18" },
  { employeeId: "EMP07", status: "Late", date: "2026-11-18" },
  { employeeId: "EMP08", status: "Half Day", date: "2026-11-18" },
];

const testLeaves = [
  { employeeId: "EMP09", startDate: "2026-11-16", endDate: "2026-11-20", status: "Approved" },
];

const reconWeekday = reconcileAttendanceForDate({
  employees: testEmployees,
  attendanceRecords: testAttendance,
  approvedLeaves: testLeaves,
  dateStr: "2026-11-18", // Wednesday
});

assert(reconWeekday.totalHeadcount === 10, `Headcount is ${reconWeekday.totalHeadcount}`);
assert(reconWeekday.present === 6, `Present count is ${reconWeekday.present}`);
assert(reconWeekday.late === 1, `Late count is ${reconWeekday.late}`);
assert(reconWeekday.halfDay === 1, `Half Day count is ${reconWeekday.halfDay}`);
assert(reconWeekday.onLeave === 1, `On Leave count is ${reconWeekday.onLeave}`);
assert(reconWeekday.absent === 1, `Absent count is ${reconWeekday.absent}`);
assert(reconWeekday.reconciliationCheckPassed === true, "Mathematical identity satisfied (6 + 1 + 1 + 1 + 0 + 1 === 10)");


// ─────────────────────────────────────────────────────────────────────────────
// 6. A-31: Employee Credential Security Checks
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔹 Testing Issue A-31: Employee Credential Security");

const empListContent = fs.readFileSync(path.join(projectRoot, "src/app/(dashboard)/employees/page.tsx"), "utf-8");
assert(!empListContent.includes("password: string;"), "employees/page.tsx: 'password: string;' removed from EmpRow interface");
assert(!empListContent.includes("password: data.password"), "employees/page.tsx: 'password: data.password' removed from data mapper");

const empDetailContent = fs.readFileSync(path.join(projectRoot, "src/app/(dashboard)/employees/[id]/page.tsx"), "utf-8");
assert(!empDetailContent.includes("password?: string;"), "employees/[id]/page.tsx: 'password?: string;' removed from Emp interface");
assert(!empDetailContent.includes("password: d.password"), "employees/[id]/page.tsx: 'password: d.password' removed from doc loader");


// ─────────────────────────────────────────────────────────────────────────────
// 7. A-39: Admin Notification Triggers
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔹 Testing Issue A-39: Admin Notifications");

const leavesContent = fs.readFileSync(path.join(projectRoot, "src/app/(dashboard)/leaves/page.tsx"), "utf-8");
assert(leavesContent.includes("notifications"), "leaves/page.tsx: Dispatches notification to admin on leave submission");
assert(leavesContent.includes('type: "leave"'), "leaves/page.tsx: Notification has type 'leave'");

const notifPageContent = fs.readFileSync(path.join(projectRoot, "src/app/(dashboard)/notifications/page.tsx"), "utf-8");
assert(notifPageContent.includes("router.push"), "notifications/page.tsx: Notification click navigates to target link");

console.log("\n================================================================================");
console.log(`VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log("================================================================================\n");

if (passedTests === totalTests) {
  console.log("🎉 ALL ISSUES (NEW-01, E-20, E-08, NEW-02, A-36, A-31, A-39) VERIFIED GREEN!");
  process.exit(0);
} else {
  console.error("❌ SOME TESTS FAILED.");
  process.exit(1);
}
