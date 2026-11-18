import { db } from "./firebase";
import {
  collection,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { Task, TaskStatus, TaskPriority, TaskActivityLog, Role } from "@/types";
import { isValidUrl } from "./utils";

export function toDateObj(val: any): Date | string {
  if (!val) return "";
  if (typeof val === "object" && typeof val.toDate === "function") {
    return val.toDate();
  }
  return val;
}

/* ─── Status Normalization & Predicates ──────────────────────── */

export function normalizeTaskStatus(status: string | undefined): TaskStatus {
  if (!status) return "Pending";
  if (status === "Review") return "Under Review";
  return status as TaskStatus;
}

export function isTaskCompleted(status: string | undefined): boolean {
  return status === "Completed";
}

export function isTaskUnderReview(status: string | undefined): boolean {
  return status === "Under Review" || status === "Review";
}

export function isTaskInProgress(status: string | undefined): boolean {
  return status === "In Progress";
}

export function isTaskPending(status: string | undefined): boolean {
  return status === "Pending";
}

export function isTaskCancelled(status: string | undefined): boolean {
  return status === "Cancelled";
}

/* ─── Deadlines & Time Tracking Helpers ──────────────────────── */

export function isTaskOverdue(task: {
  deadline?: string;
  status?: string;
  completedAt?: any;
}): boolean {
  if (!task.deadline) return false;
  if (isTaskCompleted(task.status) || isTaskCancelled(task.status)) return false;

  try {
    const deadlineDate = new Date(task.deadline);
    if (isNaN(deadlineDate.getTime())) return false;
    // If deadline is date only (e.g. YYYY-MM-DD), set to end of that day (23:59:59)
    if (task.deadline.length === 10) {
      deadlineDate.setHours(23, 59, 59, 999);
    }
    return deadlineDate.getTime() < Date.now();
  } catch {
    return false;
  }
}

export function isSubmissionDelayed(task: {
  deadline?: string;
  submittedAt?: any;
}): boolean {
  if (!task.deadline || !task.submittedAt) return false;
  try {
    const deadlineDate = new Date(task.deadline);
    if (isNaN(deadlineDate.getTime())) return false;
    if (task.deadline.length === 10) {
      deadlineDate.setHours(23, 59, 59, 999);
    }
    const submittedDate =
      typeof task.submittedAt?.toDate === "function"
        ? task.submittedAt.toDate()
        : new Date(task.submittedAt);
    return submittedDate.getTime() > deadlineDate.getTime();
  } catch {
    return false;
  }
}

/* ─── Automatic Progress Calculation ────────────────────────── */

export function calculateProgress(tasks: { status: string }[]): number {
  const activeTasks = tasks.filter((t) => !isTaskCancelled(t.status));
  if (activeTasks.length === 0) return 0;
  const completed = activeTasks.filter((t) => isTaskCompleted(t.status)).length;
  return Math.round((completed / activeTasks.length) * 100);
}

/* ─── Team Workload & Performance Metrics ────────────────────── */

export interface EmployeeWorkload {
  uid: string;
  name: string;
  employeeId: string;
  department?: string;
  designation?: string;
  avatar?: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  underReviewTasks: number;
  overdueTasks: number;
  progress: number;
  totalEstimatedHours: number;
  workloadState: "optimal" | "overloaded" | "falling_behind" | "completed" | "unassigned";
  workloadLabel: string;
}

export function calculateEmployeeWorkloads(
  employees: { uid: string; name: string; employeeId: string; department?: string; designation?: string; photoURL?: string }[],
  allTasks: Task[]
): EmployeeWorkload[] {
  return employees.map((emp) => {
    // Match by assigneeId or assignedTo
    const empTasks = allTasks.filter(
      (t) => (t.assigneeId === emp.uid || t.assignedTo === emp.uid) && !isTaskCancelled(t.status)
    );

    const total = empTasks.length;
    const completed = empTasks.filter((t) => isTaskCompleted(t.status)).length;
    const pending = empTasks.filter((t) => isTaskPending(t.status)).length;
    const inProgress = empTasks.filter((t) => isTaskInProgress(t.status)).length;
    const underReview = empTasks.filter((t) => isTaskUnderReview(t.status)).length;
    const overdue = empTasks.filter((t) => isTaskOverdue(t)).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const totalEstimatedHours = empTasks.reduce(
      (sum, t) => sum + (Number(t.estimatedHours) || 0),
      0
    );

    const activeCount = pending + inProgress + underReview;

    let workloadState: EmployeeWorkload["workloadState"] = "optimal";
    let workloadLabel = "Optimal Workload";

    if (total === 0) {
      workloadState = "unassigned";
      workloadLabel = "No Assigned Tasks";
    } else if (overdue > 0) {
      workloadState = "falling_behind";
      workloadLabel = `${overdue} Overdue Task${overdue > 1 ? "s" : ""}`;
    } else if (activeCount >= 5 || totalEstimatedHours >= 40) {
      workloadState = "overloaded";
      workloadLabel = `Overloaded (${activeCount} active tasks)`;
    } else if (completed === total) {
      workloadState = "completed";
      workloadLabel = "All Tasks Completed";
    }

    return {
      uid: emp.uid,
      name: emp.name,
      employeeId: emp.employeeId,
      department: emp.department,
      designation: emp.designation,
      avatar: emp.photoURL,
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      underReviewTasks: underReview,
      overdueTasks: overdue,
      progress,
      totalEstimatedHours,
      workloadState,
      workloadLabel,
    };
  });
}

/* ─── Activity Log & Audit Trail ─────────────────────────────── */

export async function logTaskActivity(params: {
  taskId: string;
  taskTitle: string;
  companyId?: string;
  actorId: string;
  actorName: string;
  actorRole: Role | string;
  action: TaskActivityLog["action"];
  prevStatus?: string;
  newStatus?: string;
  comment?: string;
  details?: string;
}) {
  const timestampIso = new Date().toISOString();
  const cid = params.companyId || "default";

  const logEntry = {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    companyId: cid,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    prevStatus: params.prevStatus ?? "",
    newStatus: params.newStatus ?? "",
    comment: params.comment ?? "",
    timestamp: timestampIso,
  };

  // 1. Write to immutable /auditLogs collection (queryable across system)
  try {
    await addDoc(collection(db, "auditLogs"), {
      timestamp: timestampIso,
      actorId: params.actorId,
      actorName: params.actorName || "Unknown",
      actorRole: params.actorRole || "EMPLOYEE",
      action: params.action,
      entityType: "TASK",
      entityId: params.taskId,
      description:
        params.comment ||
        `${params.actorName} changed task status from ${params.prevStatus || "None"} to ${params.newStatus}`,
      module: "EMS_TASKS",
      details: params.details ?? "",
      taskTitle: params.taskTitle,
      prevStatus: params.prevStatus ?? "",
      newStatus: params.newStatus ?? "",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to write to auditLogs:", err);
  }

  // 2. Append to task doc's activityHistory array for instant task-level inspection
  try {
    await updateDoc(doc(db, "tasks", params.taskId), {
      activityHistory: arrayUnion(logEntry),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to append activityHistory to task:", err);
  }
}

/* ─── Task Transition Controller ─────────────────────────────── */

export interface TransitionOptions {
  taskId: string;
  currentTask: Task;
  targetStatus: TaskStatus;
  actor: {
    uid: string;
    displayName: string;
    role: Role | string;
    companyId?: string;
  };
  reviewAction?: "approve" | "reject" | "changes_requested" | "override" | "submit";
  comment?: string;
  proofURL?: string;
}

export async function transitionTaskStatus(options: TransitionOptions): Promise<{ success: boolean; error?: string }> {
  const { taskId, currentTask, targetStatus, actor, reviewAction, comment, proofURL } = options;
  const isAdmin = actor.role === "super_admin" || actor.role === "hr_admin";
  const prevStatus = currentTask.status;

  // Role validation:
  // Employees cannot directly transition a task to "Completed"
  if (!isAdmin && targetStatus === "Completed") {
    return {
      success: false,
      error: "Only administrators can approve and complete tasks. Please submit your task for review.",
    };
  }

  // URL validation for proof link
  if (proofURL && proofURL.trim() !== "" && !isValidUrl(proofURL.trim())) {
    return {
      success: false,
      error: "Proof link must be a valid URL starting with http:// or https://",
    };
  }

  const updates: Record<string, any> = {
    status: targetStatus,
    updatedAt: serverTimestamp(),
  };

  let actionType: TaskActivityLog["action"] = "STATUS_CHANGE";

  // 1. Employee starts task: Pending -> In Progress
  if (targetStatus === "In Progress" && prevStatus === "Pending") {
    actionType = "STARTED";
    if (!currentTask.actualStartTime) {
      updates.actualStartTime = serverTimestamp();
    }
  }

  // 2. Employee submits for review
  if (targetStatus === "Under Review") {
    actionType = "SUBMITTED";
    updates.submittedAt = serverTimestamp();
    if (comment) updates.submissionNotes = comment;
    if (proofURL) updates.proofURL = proofURL;
  }

  // 3. Admin review actions
  if (isAdmin && targetStatus === "Completed") {
    actionType = reviewAction === "override" ? "ADMIN_OVERRIDE" : "APPROVED";
    updates.approvedAt = serverTimestamp();
    updates.completedAt = serverTimestamp();
    updates.approvedBy = actor.displayName;
    if (reviewAction === "override") {
      updates.adminOverride = true;
      updates.overrideReason = comment || "Direct administrative status override";
    }
    if (comment) updates.lastReviewComment = comment;
    updates.progress = 100;
  }

  // 4. Admin requests modifications
  if (reviewAction === "changes_requested") {
    actionType = "MODIFICATION_REQUESTED";
    updates.status = "In Progress";
    if (comment) updates.lastReviewComment = comment;
  }

  // 5. Admin rejects review
  if (reviewAction === "reject") {
    actionType = "REJECTED";
    updates.status = "In Progress";
    if (comment) updates.lastReviewComment = comment;
  }

  // 6. Admin reopens completed task
  if (isAdmin && prevStatus === "Completed" && targetStatus !== "Completed") {
    actionType = "REOPENED";
    updates.reopenedAt = serverTimestamp();
    updates.reopenedBy = actor.displayName;
    if (comment) updates.lastReviewComment = comment;
  }

  // 7. Admin general override
  if (isAdmin && reviewAction === "override") {
    actionType = "ADMIN_OVERRIDE";
    updates.adminOverride = true;
    updates.overrideReason = comment || "Admin status override";
  }

  try {
    // Update task in Firestore
    await updateDoc(doc(db, "tasks", taskId), updates);

    // Record immutable audit activity
    await logTaskActivity({
      taskId,
      taskTitle: currentTask.title,
      companyId: actor.companyId || currentTask.companyId,
      actorId: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: actionType,
      prevStatus,
      newStatus: updates.status || targetStatus,
      comment: comment || updates.overrideReason || "",
    });

    // Send notifications
    const companyId = actor.companyId || currentTask.companyId || "default";

    if (!isAdmin) {
      // Notify admins that employee updated/submitted task
      try {
        const adminSnap = await getDocs(
          query(collection(db, "users"), where("role", "in", ["super_admin", "hr_admin"]))
        );
        const adminIds = adminSnap.docs.map((ad) => ad.id);
        if (adminIds.length === 0) adminIds.push("admin");
        const notifs = adminIds.map((adId) =>
          addDoc(collection(db, "notifications"), {
            companyId,
            userId: adId,
            targetRole: "admin",
            title: targetStatus === "Under Review" ? "Task Submitted for Review" : "Task Status Updated",
            message: `${actor.displayName} ${
              targetStatus === "Under Review" ? "submitted" : "moved"
            } "${currentTask.title}" to "${targetStatus}"`,
            type: "task",
            isRead: false,
            link: "/tasks/performance",
            createdAt: serverTimestamp(),
          }).catch(() => {})
        );
        await Promise.allSettled(notifs);
      } catch (notifErr) {
        console.warn("Failed to notify specific admin uids, saving general admin notification:", notifErr);
        await addDoc(collection(db, "notifications"), {
          companyId,
          userId: "admin",
          targetRole: "admin",
          title: targetStatus === "Under Review" ? "Task Submitted for Review" : "Task Status Updated",
          message: `${actor.displayName} ${
            targetStatus === "Under Review" ? "submitted" : "moved"
          } "${currentTask.title}" to "${targetStatus}"`,
          type: "task",
          isRead: false,
          link: "/tasks/performance",
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    } else if (currentTask.assigneeId && currentTask.assigneeId !== actor.uid) {
      // Notify employee that admin approved, modified, or updated task
      let notifTitle = "Task Status Updated by Admin";
      let notifMessage = `Admin updated "${currentTask.title}" to "${targetStatus}"`;

      if (targetStatus === "Completed") {
        notifTitle = "Task Approved & Completed";
        notifMessage = `Your work on "${currentTask.title}" was approved by ${actor.displayName}`;
      } else if (reviewAction === "changes_requested") {
        notifTitle = "Changes Requested on Task";
        notifMessage = `Admin requested modifications for "${currentTask.title}": ${comment || "Please review comments."}`;
      } else if (reviewAction === "reject") {
        notifTitle = "Task Submission Rejected";
        notifMessage = `Your submission for "${currentTask.title}" was rejected: ${comment || "Needs revisions."}`;
      }

      await addDoc(collection(db, "notifications"), {
        companyId,
        userId: currentTask.assigneeId,
        title: notifTitle,
        message: notifMessage,
        type: "task",
        isRead: false,
        link: "/tasks",
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }

    return { success: true };
  } catch (err: any) {
    console.error("transitionTaskStatus error:", err);
    return { success: false, error: err?.message || "Failed to update task status" };
  }
}
