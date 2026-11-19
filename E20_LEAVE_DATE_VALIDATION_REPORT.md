# E-20 — INVALID LEAVE DATE RANGE REMEDIATION & VERIFICATION REPORT

**Application**: MakeWithUs EMS  
**Module**: Employee Portal → Leaves  
**Status**: **VERIFIED GREEN (8/8 Tests Passing)**  
**Date**: 19 November 2026  

---

## 1. Defect Summary

- **Original Defect**: When an employee submitted a leave request with:
  - Start Date: `10 December`
  - End Date: `8 December`
  - Leave Type: `Casual`
  The system accepted the request and erroneously counted it as 3 days.
- **Root Cause**: The client-side form validation had an insufficient date comparison, missing inline field-level validation messages in JSX, and lacked duplicate/overlapping request guards. Additionally, Firestore security rules allowed any authenticated employee to create leave records without enforcing that `startDate <= endDate` and `days > 0`.

---

## 2. Technical Remediation

### A. Frontend Form Validation (`src/app/(dashboard)/leaves/page.tsx`)
1. **Zod Refinement**:
   ```typescript
   const schema = z.object({
     leaveType: z.string().min(1, "Please select a leave type"),
     startDate: z.string().min(1, "Start date is required"),
     endDate:   z.string().min(1, "End date is required"),
     reason:    z.string().min(1, "Please provide a reason"),
   }).refine((d) => {
     if (!d.startDate || !d.endDate) return true;
     return d.endDate >= d.startDate;
   }, {
     message: "End date cannot be earlier than start date.",
     path: ["endDate"],
   });
   ```
2. **Inline Error UI Rendering**:
   Rendered field-specific error messages directly under the start and end date inputs:
   ```tsx
   <input id="leave-start" type="date" className="input-base" {...register("startDate")} />
   {errors.startDate && <p id="leave-start-error" style={{ fontSize: 12, color: "var(--accent-red)", marginTop: 4 }}>{errors.startDate.message}</p>}

   <input id="leave-end" type="date" className="input-base" {...register("endDate")} />
   {errors.endDate && <p id="leave-end-error" style={{ fontSize: 12, color: "var(--accent-red)", marginTop: 4 }}>{errors.endDate.message}</p>}
   ```
3. **Duplicate & Overlapping Date Range Guard**:
   In `onSubmit`:
   ```typescript
   if (data.endDate < data.startDate) {
     toast.error("End date cannot be earlier than start date.");
     return;
   }

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
   ```

### B. Firestore Security Rules (`firestore.rules`)
Enforced at the database level that no client or API request can create an invalid date range or negative/zero day count:
```javascript
match /leaveRequests/{leaveId} {
  allow create:
    if isHRAdmin()
    || (isSignedIn()
        && request.resource.data.employeeId == currentEmployeeId()
        && request.resource.data.startDate <= request.resource.data.endDate
        && request.resource.data.days > 0);
}
```

---

## 3. Independent Verification Results

Executed via automated test suite `scripts/verify_7_issues.mjs`:

| Test ID | Test Scenario | Input Data | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| E20-A | Inverted Date Range | Start: `2026-12-10`, End: `2026-12-08` | Reject with "End date cannot be earlier than start date." | Rejected, exact message verified | **PASS** |
| E20-B | Valid Multi-Day Range | Start: `2026-12-08`, End: `2026-12-10` | Accept 3 days | Accepted (diffDays = 3) | **PASS** |
| E20-C | Single-Day Leave | Start: `2026-12-10`, End: `2026-12-10` | Accept 1 day | Accepted (diffDays = 1) | **PASS** |
| E20-D | Missing Start Date | Start: `""`, End: `2026-12-10` | Reject | Rejected ("Start date is required") | **PASS** |
| E20-E | Missing End Date | Start: `2026-12-10`, End: `""` | Reject | Rejected ("End date is required") | **PASS** |
| E20-F | Overlapping Leave | New: `2026-12-09` to `2026-12-11`, Existing: `2026-12-08` to `2026-12-10` | Reject overlap | Rejected with overlap toast | **PASS** |
| E20-G | Non-Overlapping Leave | New: `2026-12-15` to `2026-12-16` | Accept | Accepted | **PASS** |
| E20-H | Backend Rules Guard | `startDate > endDate` via Firestore write | Reject with permission-denied | Rejected by security rule | **PASS** |

**Final Status: GREEN (VERIFIED)**
