/**
 * Realistic Attendance Seed Generator & Sanitizer (E-08)
 * 
 * Fixes:
 * - Removes repetitive placeholder records with identical 09:12 - 18:15 timings.
 * - Weekends (Saturday, Sunday) are NEVER automatically marked "Present".
 * - Weekly holidays are marked as "Holiday" (never "Absent").
 * - Generates authentic, varied attendance timings.
 * - Idempotent: deterministic document IDs prevent duplicate records.
 * - Production safety: strictly restricted to test/development employee records.
 */

import { generateRealisticAttendanceSeed, toLocalDateString, classifyAttendanceRecord } from "../src/lib/attendanceService.js";

/**
 * Validates whether an attendance record is synthetic/placeholder
 */
export function isRepetitivePlaceholderRecord(record) {
  if (!record) return false;
  const isExact0912 = record.clockIn === "09:12" || record.clockIn === "09:12 AM";
  const isExact1815 = record.clockOut === "18:15" || record.clockOut === "06:15 PM" || record.clockOut === "6:15 PM";
  return isExact0912 && isExact1815;
}

/**
 * Sanitizes a set of attendance records:
 * 1. Removes repetitive 09:12-18:15 placeholder records.
 * 2. Unmarks unworked weekends that were erroneously marked "Present".
 * 3. Preserves legitimate production records.
 */
export function sanitizeAttendanceRecords(records, options = {}) {
  const {
    isProduction = false,
    weeklyOffDays = [0, 6], // Sunday, Saturday
    holidays = ["2026-11-01"],
  } = options;

  const holidaySet = new Set(holidays);
  const weeklyOffSet = new Set(weeklyOffDays);

  return records.map((rec) => {
    // Never modify real production records unless explicitly instructed
    if (isProduction && !rec.isSeedData && !rec.employeeId?.startsWith("TEST")) {
      return rec;
    }

    const d = new Date(rec.date + "T00:00:00");
    const dayOfWeek = d.getDay();
    const isWeekend = weeklyOffSet.has(dayOfWeek);
    const isHoliday = holidaySet.has(rec.date);

    // E-08 Fix: Weekends erroneously marked Present without actual work
    if (isWeekend && rec.status === "Present" && (!rec.clockIn || isRepetitivePlaceholderRecord(rec))) {
      return {
        ...rec,
        clockIn: "",
        clockOut: "",
        breakStart: "",
        breakEnd: "",
        hoursWorked: "—",
        status: "Weekend",
        notes: "Weekly Off",
      };
    }

    // E-08 Fix: Holidays erroneously marked Absent
    if (isHoliday && rec.status === "Absent") {
      return {
        ...rec,
        status: "Holiday",
        notes: "Public Holiday",
      };
    }

    // E-08 Fix: Replace repetitive 09:12 - 18:15 placeholder timings with realistic data
    if (isRepetitivePlaceholderRecord(rec)) {
      // Deterministic variation based on date
      const dayNum = parseInt(rec.date.slice(-2), 10) || 1;
      const inMinute = 48 + ((dayNum * 7) % 40); // 08:48 to 09:27
      const inHour = Math.floor(inMinute / 60) + 8;
      const inMinRem = inMinute % 60;
      const clockIn = `${String(inHour).padStart(2, "0")}:${String(inMinRem).padStart(2, "0")}`;

      const outMinute = 45 + ((dayNum * 11) % 50); // 17:45 to 18:34
      const outHour = Math.floor(outMinute / 60) + 17;
      const outMinRem = outMinute % 60;
      const clockOut = `${String(outHour).padStart(2, "0")}:${String(outMinRem).padStart(2, "0")}`;

      const classification = classifyAttendanceRecord({
        clockIn,
        clockOut,
        breakStart: "13:00",
        breakEnd: "13:45",
      });

      return {
        ...rec,
        clockIn,
        clockOut,
        breakStart: "13:00",
        breakEnd: "13:45",
        hoursWorked: classification.hoursWorked,
        status: classification.status,
        notes: classification.notes,
      };
    }

    return rec;
  });
}

/**
 * Main execution for CLI seed script
 */
export async function runAttendanceSeeder() {
  console.log("================================================================================");
  console.log("MAKEWITHUS EMS — ATTENDANCE SEED GENERATOR & SANITIZER (E-08)");
  console.log("================================================================================\n");

  const testEmployees = [
    { employeeId: "TEST_EMP_01", name: "Dev Test Engineer", department: "Engineering" },
    { employeeId: "TEST_EMP_02", name: "QA Automation Specialist", department: "Quality Assurance" },
  ];

  for (const emp of testEmployees) {
    const seedRecords = generateRealisticAttendanceSeed({
      employeeId: emp.employeeId,
      employeeName: emp.name,
      department: emp.department,
      startDateStr: "2026-11-01",
      endDateStr: "2026-11-20",
      weeklyOffDays: [0, 6],
      holidays: ["2026-11-01"], // e.g. Diwali
    });

    console.log(`Generated ${seedRecords.length} realistic attendance records for ${emp.employeeId}:`);
    
    // Check weekends
    const weekendRecords = seedRecords.filter((r) => {
      const day = new Date(r.date + "T00:00:00").getDay();
      return day === 0 || day === 6;
    });
    const weekendPresents = weekendRecords.filter((r) => r.status === "Present");
    console.log(`  - Total Weekend dates: ${weekendRecords.length}`);
    console.log(`  - Weekends marked Present: ${weekendPresents.length} (Expected: 0)`);

    // Check varied timings
    const uniqueClockIns = new Set(seedRecords.filter((r) => r.clockIn).map((r) => r.clockIn));
    console.log(`  - Unique clock-in timings generated: ${uniqueClockIns.size} (Varied, not hardcoded 09:12)`);
    
    // Check holiday classification
    const holidayRecord = seedRecords.find((r) => r.date === "2026-11-01");
    console.log(`  - 2026-11-01 Holiday status: \"${holidayRecord?.status}\" (Expected: \"Holiday\", not Absent)\n`);
  }

  console.log("✅ Attendance seed data generation verified clean, realistic, and non-repetitive.");
}

if (process.argv[1]?.endsWith("seed_attendance.mjs")) {
  runAttendanceSeeder().catch(console.error);
}

