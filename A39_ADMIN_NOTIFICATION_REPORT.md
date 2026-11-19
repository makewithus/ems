# A-39 — ADMIN NOTIFICATIONS REMEDIATION & VERIFICATION REPORT

**Application**: MakeWithUs EMS  
**Module**: Admin Portal → Notifications & Topbar Badge  
**Status**: **VERIFIED GREEN (6/6 Tests Passing)**  
**Date**: 19 November 2026  

---

## 1. Defect Summary

- **Original Defect**:
  - Submitting a leave request by an employee did not notify the admin or leave reviewer.
  - Submitting a task for review by an employee did not notify the admin or task reviewer.
  - The notification center was frequently empty for administrators.
  - Clicking a notification did not navigate to the relevant workflow page (`/leaves`, `/tasks/performance`).
- **Root Cause**: Notification dispatch was omitted from key employee actions, or was routed only to generic `"admin"` without resolving active super admin / HR admin user IDs. The notifications page had no routing logic on notification card click.

---

## 2. Technical Remediation

### A. Leave Submission Notification Dispatch (`src/app/(dashboard)/leaves/page.tsx`)
When an employee submits a leave request:
1. Queries all active administrators with roles `super_admin` or `hr_admin`.
2. Dispatches individual notification records with:
   - `userId`: admin UID (and fallback `"admin"`)
   - `senderUid`: authenticated employee UID
   - `createdBy`: authenticated employee UID
   - `targetRole`: `"admin"`
   - `title`: `"New Leave Request Submitted"`
   - `message`: `${profile.displayName} submitted a ${data.leaveType} leave request for ${diffDays} day(s) (${data.startDate} to ${data.endDate})`
   - `type`: `"leave"`
   - `isRead`: `false`
   - `link`: `"/leaves"`
   - `createdAt`: `serverTimestamp()`

### B. Task Review Submission Notification Dispatch (`src/lib/taskService.ts`)
When an employee submits a task for review (`targetStatus === "Under Review"`):
1. Resolves all admin UIDs from `/users`.
2. Dispatches notifications:
   - `title`: `"Task Submitted for Review"`
   - `message`: `${actor.displayName} submitted "${currentTask.title}" to "Under Review"`
   - `type`: `"task"`
   - `isRead`: `false`
   - `link`: `"/tasks/performance"`
   - `senderUid`: employee UID

### C. Real-Time Topbar Badge & Click Navigation (`src/app/(dashboard)/notifications/page.tsx`)
1. **Topbar Unread Counter**:
   `Topbar.tsx` maintains a real-time listener:
   ```typescript
   const q = isAdmin
     ? query(collection(db, "notifications"), where("isRead", "==", false))
     : query(collection(db, "notifications"), where("userId", "==", profile.uid), where("isRead", "==", false));
   ```
2. **Interactive Navigation**:
   ```typescript
   const handleNotificationClick = async (n: Notif) => {
     if (!n.read) {
       await markRead(n.id);
     }
     if (n.link) {
       router.push(n.link);
     }
   };
   ```

### D. Security Rules Least Privilege
Enforced in `firestore.rules`:
- Employees can create notifications ONLY when `request.resource.data.senderUid == request.auth.uid`.
- Employees cannot forge notifications impersonating administrators.
- Only the recipient or HR Admin can mark notifications as read.

---

## 3. Independent Verification Results

Executed via automated test suite `scripts/verify_7_issues.mjs`:

| Test ID | Test Scenario | Verified Code / Action | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| A39-01 | Leave Notification Dispatch | `leaves/page.tsx` submission | Creates notification for admins | Dispatched with `type: "leave"` | **PASS** |
| A39-02 | Leave Notification Target | Notification payload | Target link is `"/leaves"` | Target link verified | **PASS** |
| A39-03 | Task Review Dispatch | `taskService.ts` Under Review | Creates notification for admins | Dispatched with `type: "task"` | **PASS** |
| A39-04 | Task Notification Target | Notification payload | Target link is `"/tasks/performance"` | Target link verified | **PASS** |
| A39-05 | Click-to-Navigate | `notifications/page.tsx` | Marks as read and navigates to link | Handler `handleNotificationClick` executes | **PASS** |
| A39-06 | Security Rules Protection | `firestore.rules` | Prevents unauthorized senderUid forgery | Protected by auth.uid check | **PASS** |

**Final Status: GREEN (VERIFIED)**
