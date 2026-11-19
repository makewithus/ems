# E-06 — ATTENDANCE BREAK & CLOCK-OUT CALCULATION REMEDIATION & VERIFICATION REPORT

**Application**: MakeWithUs EMS  
**Module**: Employee Portal → Attendance  
**Status**: **VERIFIED GREEN (5/5 Tests Passing)**  
**Date**: 19 November 2026  

---

## 1. Defect Summary

- **Original Defect**:
  - Clock-in: `11:44`
  - Clock-out: `11:50`
  - Break: `1 minute` (e.g. `11:46` to `11:47`)
  - **Actual Result**: Duration was calculated as `6 minutes` (total elapsed without break deduction), or the attendance status remained in an active hanging state.
  - **Expected Result**: Net working duration must be `5 minutes` ($6 - 1 = 5$ minutes); status must transition to a completed state (`Half Day` if $< 240$ minutes, else `Present` or `Late`).
- **Root Cause**:
  1. When clocking out while an active break was open (`breakStart` set but `breakEnd` empty), `breakEnd` was not finalized, causing the break calculation to evaluate as zero and remain un-deducted.
  2. The status transition logic did not guarantee that a clocked-out record moved to a terminal completed status, leaving active status flags.

---

## 2. Technical Remediation

### A. Break Finalization & Net Working Duration (`src/hooks/useAttendance.ts`)
In `recordClockOut`:
1. **Auto-Close Open Breaks**:
   If an employee clocks out while on break:
   ```typescript
   let effectiveBreakEnd = breakEnd;
   if (breakStart && !effectiveBreakEnd) {
     effectiveBreakEnd = timeStr; // Finalize break at clock-out timestamp
   }
   ```
2. **Net Duration Computation**:
   ```typescript
   const hoursWorked = computeHoursWorked(resolvedClockIn, timeStr, breakStart, effectiveBreakEnd);
   ```
   In `computeHoursWorked`:
   ```typescript
   let diff = outMins - inMins;
   if (breakStart && breakEnd) {
     const bs = parseTimeToMinutes(breakStart);
     const be = parseTimeToMinutes(breakEnd);
     if (bs !== null && be !== null && be > bs) {
       diff = Math.max(0, diff - (be - bs));
     }
   }
   const h = Math.floor(diff / 60);
   const m = diff % 60;
   return `${h}h ${m}m`;
   ```
   For $11:44$ to $11:50$ with $1$ minute break ($11:46$ to $11:47$):
   $$\text{diff} = (11 \times 60 + 50) - (11 \times 60 + 44) = 6 \text{ minutes}$$
   $$\text{bDuration} = 47 - 46 = 1 \text{ minute}$$
   $$\text{Net Duration} = 6 - 1 = 5 \text{ minutes} \implies \mathbf{"0h\ 5m"}$$

3. **Guaranteed Terminal Status Transition**:
   ```typescript
   let updatedStatus: AttendanceRecord["status"];
   let notes = "";
   if (diff < 240) {
     updatedStatus = "Half Day";
     notes = "Short day (< 4h worked)";
   } else if (inMins <= 9 * 60 + 15) {
     updatedStatus = "Present";
   } else {
     updatedStatus = "Late";
   }
   ```
   The record is ALWAYS persisted with a completed terminal status (`"Half Day"`, `"Present"`, or `"Late"`). Never an open or active status.

4. **Guards Against Chronological Inversions**:
   ```typescript
   if (!resolvedClockIn) throw new Error("Cannot clock out without an active clock-in.");
   if (outMins < inMins) throw new Error("Clock-out time cannot be earlier than clock-in time.");
   ```

---

## 3. Independent Verification Results

Executed via automated test suite `scripts/verify_7_issues.mjs`:

| Test ID | Test Scenario | Timestamps & Inputs | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| E06-01 | Original Defect Verification | In: `11:44`, Out: `11:50`, Break: `11:46`–`11:47` | Net: `"0h 5m"` | `"0h 5m"` | **PASS** |
| E06-02 | Auto-Close Open Break | In: `11:44`, Out: `11:50`, Break: `11:46` (no end) | Break auto-ends at 11:50, Net: `"0h 2m"` | `"0h 2m"` | **PASS** |
| E06-03 | Short Day Status Transition | Duration: 5 mins (< 240 mins) | Status: `"Half Day"` | `"Half Day"` | **PASS** |
| E06-04 | Full Day On-Time Transition | In: `09:00`, Out: `17:30`, Break: 30m | Status: `"Present"` | `"Present"` | **PASS** |
| E06-05 | Full Day Late Transition | In: `09:30`, Out: `18:00`, Break: 30m | Status: `"Late"` | `"Late"` | **PASS** |

**Final Status: GREEN (VERIFIED)**
