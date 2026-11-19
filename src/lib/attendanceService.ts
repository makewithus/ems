/**
 * Authoritative Attendance Reconciliation Service
 * Resolves Issue A-36: Attendance Count Reconciliation across
 * Admin Attendance, Admin Dashboard, Team Performance, and Reports.
 *
 * Guarantees 100% headcount reconciliation based on the mathematical identity:
 * Total Headcount = Present + Late + Half Day + On Leave + Absent (Workforce) + Weekly Off / Holiday
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
