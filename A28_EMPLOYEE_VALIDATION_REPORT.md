# A-28 — INVALID EMPLOYEE DATA VALIDATION REMEDIATION & VERIFICATION REPORT

**Application**: MakeWithUs EMS  
**Module**: Admin Portal → Employees → Add Employee / Edit Employee  
**Status**: **VERIFIED GREEN (10/10 Tests Passing)**  
**Date**: 19 November 2026  

---

## 1. Defect Summary

- **Original Defect**: When creating an employee:
  - Phone: `abcxyz`
  - DOB: `2030-01-01`
  - Last Name: `Test123`
  The form accepted these values without field-specific errors, or errors were invisible to the user.
- **Root Cause**:
  1. `<Field label="Phone Number" id="phone">` and `<Field label="Date of Birth" id="dob">` in `src/app/(dashboard)/employees/add/page.tsx` were instantiated without passing `error={errors.phone?.message}` and `error={errors.dob?.message}`, causing field errors to remain invisible.
  2. The name regex `/^[A-Za-z\s'-]+$/` rejected international Unicode characters while failing to enforce Unicode letter boundaries (`\p{L}`).
  3. Phone uniqueness was not checked against existing employees prior to account creation.
  4. Edit modal in `src/app/(dashboard)/employees/[id]/page.tsx` lacked corresponding client-side validation checks.

---

## 2. Technical Remediation

### A. Add Employee Form (`src/app/(dashboard)/employees/add/page.tsx`)
1. **Schema Enhancements**:
   ```typescript
   const schema = z.object({
     firstName: z.string().trim().min(1, "First name is required").regex(/^[\p{L}\s'-]+$/u, "First name must contain letters only"),
     lastName:  z.string().trim().min(1, "Last name is required").regex(/^[\p{L}\s'-]+$/u, "Last name must contain letters only"),
     phone:     z.string().optional().refine((val) => {
                  if (!val || !val.trim()) return true;
                  if (/[a-zA-Z]/.test(val)) return false;
                  const cleaned = val.replace(/[\s\-()]/g, "");
                  return /^(\+?\d{7,15})$/.test(cleaned);
                }, "Please enter a valid phone number (digits only, 7-15 digits)"),
     dob:       z.string().optional().refine((val) => {
                  if (!val || !val.trim()) return true;
                  const d = new Date(val + "T00:00:00");
                  if (isNaN(d.getTime())) return false;
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  if (d >= now) return false;
                  const age = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
                  return age >= 18 && age <= 100;
                }, "Date of birth must be a past date and employee must be at least 18 years old"),
   });
   ```
2. **JSX Field-Level Error Binding**:
   ```tsx
   <Field label="Phone Number" id="phone" error={errors.phone?.message}>
     <input id="phone" className="input-base" placeholder="+91 98765 43210" {...register("phone")} />
   </Field>
   <Field label="Date of Birth" id="dob" error={errors.dob?.message}>
     <input id="dob" type="date" className="input-base" {...register("dob")} />
   </Field>
   ```
3. **Phone Uniqueness Enforcement**:
   In `onSubmit`:
   ```typescript
   if (data.phone && data.phone.trim()) {
     const cleaned = data.phone.replace(/[\s\-()]/g, "");
     const { collection: col, query: q, where: w, getDocs: gd } = await import("firebase/firestore");
     const phoneSnap = await gd(q(col(db, "employees"), w("phone", "==", cleaned)));
     const rawPhoneSnap = await gd(q(col(db, "employees"), w("phone", "==", data.phone.trim())));
     if (!phoneSnap.empty || !rawPhoneSnap.empty) {
       toast.error("This phone number is already registered to another employee.");
       setSaving(false);
       return;
     }
   }
   ```

### B. Edit Employee Modal (`src/app/(dashboard)/employees/[id]/page.tsx`)
Mirrored exact validation logic on edit modal submission:
- Validates `firstName` and `lastName` against `/^[\p{L}\s'-]+$/u`.
- Validates `phone` against digits-only format `^(\+?\d{7,15})$`.
- Validates `dob` against past date and valid timestamp.

---

## 3. Independent Verification Results

Executed via automated test suite `scripts/verify_7_issues.mjs`:

| Test ID | Test Scenario | Input Data | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| A28-01 | Alphabetic Phone | Phone: `abcxyz` | Reject | Rejected ("Please enter a valid phone number") | **PASS** |
| A28-02 | Future DOB | DOB: `2030-01-01` | Reject | Rejected ("Date of birth must be a past date...") | **PASS** |
| A28-03 | Numeric Suffix Name | Last Name: `Test123` | Reject | Rejected ("Last name must contain letters only") | **PASS** |
| A28-04 | Valid Indian Phone | Phone: `+91 98765 43210` | Accept | Accepted | **PASS** |
| A28-05 | Valid Past DOB | DOB: `1998-04-22` | Accept | Accepted | **PASS** |
| A28-06 | Empty Last Name | Last Name: `""` | Reject | Rejected ("Last name is required") | **PASS** |
| A28-07 | Name with Spaces | `Sudarson Ananda` | Accept | Accepted | **PASS** |
| A28-08 | Name with Hyphen/Apostrophe | `Mary-Jane O'Connor` | Accept | Accepted | **PASS** |
| A28-09 | International Unicode Name | `José Müller` | Accept | Accepted | **PASS** |
| A28-10 | Phone Uniqueness Check | Duplicate phone | Reject | Blocked with unique error message | **PASS** |

**Final Status: GREEN (VERIFIED)**
