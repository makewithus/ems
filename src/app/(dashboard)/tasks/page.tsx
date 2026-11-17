"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  X,
  GripVertical,
  ChevronDown,
  Loader2,
  ClipboardList,
  User,
  Calendar,
  TrendingUp,
  FileCheck2,
  CheckCircle2,
  History,
  AlertTriangle,
  Clock,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  RotateCcw,
  Search,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { formatDate, formatDateTime, timeAgo, TASK_STATUS, TASK_PRIORITIES } from "@/lib/utils";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  getDocs,
} from "firebase/firestore";
import { Task, TaskPriority, TaskStatus, TaskActivityLog, Role } from "@/types";
import {
  transitionTaskStatus,
  isTaskCompleted,
  isTaskUnderReview,
  isTaskInProgress,
  isTaskPending,
  isTaskOverdue,
  isSubmissionDelayed,
  calculateProgress,
  normalizeTaskStatus,
  toDateObj,
} from "@/lib/taskService";

/* ─── Constants ──────────────────────────────────────────────── */
const PRIORITY_COLOR: Record<string, string> = {
  Low: "var(--text-muted)",
  Medium: "var(--accent-blue)",
  High: "var(--accent-amber)",
  Urgent: "var(--accent-red)",
  Critical: "var(--accent-red)",
};

const PRIORITY_BG: Record<string, string> = {
  Low: "rgba(255,255,255,0.06)",
  Medium: "var(--accent-blue-dim)",
  High: "var(--accent-amber-dim)",
  Urgent: "var(--accent-red-dim)",
  Critical: "var(--accent-red-dim)",
};

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "Pending", label: "Pending", color: "var(--text-muted)" },
  { status: "In Progress", label: "In Progress", color: "var(--accent-blue)" },
  { status: "Under Review", label: "Under Review", color: "var(--accent-amber)" },
  { status: "Completed", label: "Completed", color: "var(--accent-green)" },
];

type EmpOption = { uid: string; name: string; employeeId: string };

export default function TasksPage() {
  const { role, user, profile } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Create Task Form State
  const [newTask, setNewTask] = useState({
    title: "",
    desc: "",
    startDate: new Date().toISOString().split("T")[0],
    deadline: "",
    priority: "Medium" as TaskPriority,
    estimatedHours: 8,
    assigneeId: "",
    assigneeName: "",
  });

  // Employee Submission Modal
  const [submitTaskTarget, setSubmitTaskTarget] = useState<Task | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionProofURL, setSubmissionProofURL] = useState("");
  const [submittingWork, setSubmittingWork] = useState(false);

  // Admin Review / Override Modal
  const [reviewModalTask, setReviewModalTask] = useState<Task | null>(null);
  const [reviewActionType, setReviewActionType] = useState<"approve" | "changes_requested" | "reject" | "override" | null>(null);
  const [adminReviewComment, setAdminReviewComment] = useState("");
  const [overrideStatusVal, setOverrideStatusVal] = useState<TaskStatus>("Completed");
  const [executingReview, setExecutingReview] = useState(false);

  // Timeline / History Modal
  const [timelineTask, setTimelineTask] = useState<Task | null>(null);
  const [taskAuditLogs, setTaskAuditLogs] = useState<TaskActivityLog[]>([]);

  /* ── Drag State ── */
  const dragId = useRef<string | null>(null);
  const dragTarget = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  /* ── Load Employees for Assignment ── */
  useEffect(() => {
    if (!isAdmin) {
      if (user?.uid) {
        setEmployees([
          {
            uid: user.uid,
            name: profile?.displayName || user.displayName || user.email || "Me",
            employeeId: (profile as { employeeId?: string })?.employeeId || "Current User",
          },
        ]);
      }
      return;
    }

    const q = query(collection(db, "users"), where("role", "==", "employee"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const empList = snap.docs
          .map((d) => ({
            uid: d.id,
            name: d.data().displayName ?? d.data().email ?? d.id,
            employeeId: d.data().employeeId ?? d.id,
          }))
          .filter((e) => e.name);

        if (user?.uid && !empList.some((e) => e.uid === user.uid)) {
          empList.push({
            uid: user.uid,
            name: profile?.displayName || user.displayName || user.email || "Me",
            employeeId: (profile as { employeeId?: string })?.employeeId || "Current User",
          });
        }

        empList.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(empList);
      },
      (err) => console.error("Failed to fetch employees:", err)
    );
    return () => unsub();
  }, [isAdmin, user?.uid, profile?.displayName, user?.displayName, user?.email, profile]);

  /* ── Real-time Tasks Listener ── */
  useEffect(() => {
    if (!user?.uid || !role) return;

    let unsub: (() => void) | undefined;
    let unsub2: (() => void) | undefined;
    let unsub3: (() => void) | undefined;
    const taskMap = new Map<string, Task>();

    const mergeAndSet = () => {
      const taskList = Array.from(taskMap.values());
      if (!isAdmin) {
        taskList.sort((a, b) => {
          const aTime = (a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
          const bTime = (b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
      }
      setTasks(taskList);
      setLoading(false);
    };

    const mapDoc = (d: import("firebase/firestore").QueryDocumentSnapshot) => {
      const data = d.data();
      const rawStatus = data.status ?? "Pending";
      const normalizedStatus = normalizeTaskStatus(rawStatus);

      return {
        id: d.id,
        companyId: data.companyId || "default",
        title: data.title ?? "",
        desc: data.desc ?? data.description ?? "",
        startDate: data.startDate ?? "",
        deadline: data.deadline ?? "",
        priority: data.priority ?? "Medium",
        status: normalizedStatus,
        assigneeId: data.assigneeId ?? data.assignedTo ?? "",
        assigneeName: data.assigneeName ?? data.assignedToName ?? "Unassigned",
        assignedTo: data.assignedTo ?? data.assigneeId ?? "",
        estimatedHours: data.estimatedHours ?? 0,
        actualStartTime: data.actualStartTime,
        submittedAt: data.submittedAt,
        submissionNotes: data.submissionNotes,
        proofURL: data.proofURL,
        approvedAt: data.approvedAt,
        approvedBy: data.approvedBy,
        completedAt: data.completedAt,
        reopenedAt: data.reopenedAt,
        reopenedBy: data.reopenedBy,
        lastReviewComment: data.lastReviewComment,
        adminOverride: data.adminOverride,
        overrideReason: data.overrideReason,
        progress: data.progress ?? 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Task;
    };

    if (isAdmin) {
      const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        (err) => {
          console.error("Tasks listener error:", err);
          setLoading(false);
        }
      );
    } else {
      const q1 = query(collection(db, "tasks"), where("assigneeId", "==", user.uid));
      const q2 = query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
      const q3 = query(collection(db, "tasks"), where("createdByUid", "==", user.uid));

      unsub = onSnapshot(
        q1,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        () => setLoading(false)
      );
      unsub2 = onSnapshot(
        q2,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        () => setLoading(false)
      );
      unsub3 = onSnapshot(
        q3,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        () => setLoading(false)
      );
    }

    return () => {
      unsub?.();
      unsub2?.();
      unsub3?.();
    };
  }, [user?.uid, role, isAdmin]);

  /* ── Fetch Audit Logs for Timeline Modal ── */
  useEffect(() => {
    if (!timelineTask) {
      setTaskAuditLogs([]);
      return;
    }

    const q = query(
      collection(db, "auditLogs"),
      where("entityId", "==", timelineTask.id)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TaskActivityLog[];
        logs.sort((a, b) => {
          const aTime = a.timestamp?.toMillis?.() || (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
          const bTime = b.timestamp?.toMillis?.() || (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
          return bTime - aTime;
        });
        setTaskAuditLogs(logs);
      },
      (err) => console.error("Error fetching task audit logs:", err)
    );

    return () => unsub();
  }, [timelineTask]);

  /* ── Move Task Handler (Workflow Enforcement) ── */
  const moveTask = useCallback(
    async (id: string, targetColStatus: TaskStatus) => {
      const task = tasks.find((t) => t.id === id);
      if (!task || task.status === targetColStatus) return;

      // WORKFLOW RULE 1:
      // Employees cannot directly move to "Completed". They must submit for review.
      if (!isAdmin && targetColStatus === "Completed") {
        toast.error("Tasks must be submitted for Admin Review before they can be completed.");
        setSubmitTaskTarget(task);
        return;
      }

      // WORKFLOW RULE 2:
      // If moving to "Under Review", open submission modal for employee
      if (!isAdmin && targetColStatus === "Under Review") {
        setSubmitTaskTarget(task);
        return;
      }

      // WORKFLOW RULE 3:
      // If Admin is moving to Completed, open review confirmation
      if (isAdmin && targetColStatus === "Completed") {
        setReviewModalTask(task);
        setReviewActionType("approve");
        setOverrideStatusVal("Completed");
        return;
      }

      // Normal Transition (e.g. Pending -> In Progress)
      const res = await transitionTaskStatus({
        taskId: id,
        currentTask: task,
        targetStatus: targetColStatus,
        actor: {
          uid: user?.uid || "user",
          displayName: profile?.displayName || user?.displayName || "User",
          role: role || "employee",
          companyId: profile?.companyId || "default",
        },
      });

      if (res.success) {
        toast.success(`Task status updated to "${targetColStatus}"`);
      } else {
        toast.error(res.error || "Failed to update task");
      }
    },
    [tasks, isAdmin, user, profile, role]
  );

  /* ── Employee Submits Work for Review ── */
  const handleConfirmSubmission = async () => {
    if (!submitTaskTarget) return;
    setSubmittingWork(true);

    try {
      const res = await transitionTaskStatus({
        taskId: submitTaskTarget.id,
        currentTask: submitTaskTarget,
        targetStatus: "Under Review",
        actor: {
          uid: user?.uid || "user",
          displayName: profile?.displayName || user?.displayName || "Employee",
          role: role || "employee",
          companyId: profile?.companyId || "default",
        },
        reviewAction: "submit",
        comment: submissionNotes.trim(),
        proofURL: submissionProofURL.trim(),
      });

      if (res.success) {
        toast.success("Work submitted for Admin Review! Status is now Under Review.");
        setSubmitTaskTarget(null);
        setSubmissionNotes("");
        setSubmissionProofURL("");
      } else {
        toast.error(res.error || "Failed to submit work");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmittingWork(false);
    }
  };

  /* ── Admin Review / Override Execution ── */
  const handleExecuteAdminDecision = async () => {
    if (!reviewModalTask || !reviewActionType) return;
    setExecutingReview(true);

    try {
      let targetStatus: TaskStatus = "In Progress";
      if (reviewActionType === "approve") {
        targetStatus = "Completed";
      } else if (reviewActionType === "override") {
        targetStatus = overrideStatusVal;
      }

      const res = await transitionTaskStatus({
        taskId: reviewModalTask.id,
        currentTask: reviewModalTask,
        targetStatus,
        actor: {
          uid: user?.uid || "admin",
          displayName: profile?.displayName || user?.displayName || "Admin",
          role: role || "super_admin",
          companyId: profile?.companyId || "default",
        },
        reviewAction: reviewActionType,
        comment: adminReviewComment.trim(),
      });

      if (res.success) {
        toast.success(
          reviewActionType === "approve"
            ? "Task approved and marked as Completed!"
            : reviewActionType === "changes_requested"
            ? "Changes requested. Task moved back to In Progress."
            : reviewActionType === "reject"
            ? "Task rejected."
            : `Status overridden to ${targetStatus}.`
        );
        setReviewModalTask(null);
        setReviewActionType(null);
        setAdminReviewComment("");
      } else {
        toast.error(res.error || "Failed to process review");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setExecutingReview(false);
    }
  };

  /* ── Create Task ── */
  const addTask = async () => {
    if (!newTask.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    if (!newTask.assigneeId) {
      toast.error("Please select an assignee");
      return;
    }
    if (!newTask.deadline) {
      toast.error("Please set a completion deadline");
      return;
    }

    setSaving(true);
    try {
      const companyId = profile?.companyId || "default";
      const creatorName = profile?.displayName || user?.displayName || (isAdmin ? "Admin" : "Employee");

      const docRef = await addDoc(collection(db, "tasks"), {
        companyId,
        title: newTask.title.trim(),
        desc: newTask.desc.trim(),
        description: newTask.desc.trim(),
        startDate: newTask.startDate,
        deadline: newTask.deadline,
        priority: newTask.priority,
        estimatedHours: Number(newTask.estimatedHours) || 0,
        status: "Pending",
        progress: 0,
        assigneeId: newTask.assigneeId,
        assigneeName: newTask.assigneeName,
        assignedTo: newTask.assigneeId,
        assignedToName: newTask.assigneeName,
        createdBy: creatorName,
        createdByUid: user?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: new Date().toISOString(),
        actorId: user?.uid || "admin",
        actorName: creatorName,
        actorRole: role || "super_admin",
        action: "CREATED",
        entityType: "TASK",
        entityId: docRef.id,
        description: `${creatorName} assigned task "${newTask.title.trim()}" to ${newTask.assigneeName}`,
        module: "EMS_TASKS",
        taskTitle: newTask.title.trim(),
        prevStatus: "None",
        newStatus: "Pending",
        createdAt: serverTimestamp(),
      });

      // Notification
      if (newTask.assigneeId && newTask.assigneeId !== user?.uid) {
        await addDoc(collection(db, "notifications"), {
          companyId,
          userId: newTask.assigneeId,
          title: "New Task Assigned",
          message: `${creatorName} assigned you: "${newTask.title.trim()}" (Deadline: ${formatDate(newTask.deadline)})`,
          type: "task",
          isRead: false,
          link: "/tasks",
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      toast.success("Task assigned successfully!");
      setNewTask({
        title: "",
        desc: "",
        startDate: new Date().toISOString().split("T")[0],
        deadline: "",
        priority: "Medium",
        estimatedHours: 8,
        assigneeId: "",
        assigneeName: "",
      });
      setShowForm(false);
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  /* ── Drag & Drop Handlers ── */
  const onDragStart = (e: React.DragEvent, id: string) => {
    dragId.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const onDragEnd = () => {
    if (dragId.current && dragTarget.current) {
      moveTask(dragId.current, dragTarget.current as TaskStatus);
    }
    dragId.current = null;
    dragTarget.current = null;
    setDraggingId(null);
    setOverColumn(null);
  };

  const onColumnDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragTarget.current = status;
    setOverColumn(status);
  };

  const onColumnDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = dragId.current ?? e.dataTransfer.getData("text/plain");
    if (id) moveTask(id, status as TaskStatus);
    dragId.current = null;
    dragTarget.current = null;
    setDraggingId(null);
    setOverColumn(null);
  };

  const onColumnDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOverColumn(null);
    }
  };

  /* ── Filtered Tasks ── */
  const filteredTasks = useMemo(() => {
    if (!searchFilter.trim()) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (t.assigneeName || "").toLowerCase().includes(searchFilter.toLowerCase()) ||
        (t.desc && t.desc.toLowerCase().includes(searchFilter.toLowerCase()))
    );
  }, [tasks, searchFilter]);

  /* ── Personal Employee Metrics for Banner ── */
  const personalProgress = useMemo(() => {
    if (isAdmin) return null;
    const myTasks = tasks.filter((t) => t.assigneeId === user?.uid || t.assignedTo === user?.uid);
    const total = myTasks.length;
    const completed = myTasks.filter((t) => isTaskCompleted(t.status)).length;
    const inProgress = myTasks.filter((t) => isTaskInProgress(t.status)).length;
    const underReview = myTasks.filter((t) => isTaskUnderReview(t.status)).length;
    const pending = myTasks.filter((t) => isTaskPending(t.status)).length;
    const overdue = myTasks.filter((t) => isTaskOverdue(t)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, underReview, pending, overdue, percent };
  }, [tasks, isAdmin, user?.uid]);

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 64 }}>
      {/* Header & Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>
            Task Management
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13 }}>
            {isAdmin
              ? `${tasks.length} tasks across all employees • Drag tasks to update or review submissions`
              : `${tasks.filter((t) => t.status !== "Completed").length} active tasks assigned to you`}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* View toggle (Kanban vs List) */}
          <div style={{ display: "flex", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 3, gap: 2 }}>
            {(["kanban", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`btn ${viewMode === v ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "5px 12px", fontSize: 12, textTransform: "capitalize" }}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Link to Team Performance & Task Tracking */}
          <Link
            href="/tasks/performance"
            className="btn btn-secondary"
            style={{ gap: 6, fontSize: 12, padding: "6px 14px", textDecoration: "none" }}
          >
            <TrendingUp size={14} color="var(--brand-red)" /> Team Performance &amp; Task Tracking
          </Link>

          <button
            id="task-create"
            className="btn btn-primary"
            style={{ gap: 6, background: "var(--brand-red)", padding: "7px 16px" }}
            onClick={() => {
              if (!isAdmin && user) {
                const selfEmp = employees.find((e) => e.uid === user.uid);
                setNewTask((p) => ({
                  ...p,
                  assigneeId: p.assigneeId || user.uid,
                  assigneeName: p.assigneeName || selfEmp?.name || profile?.displayName || user.displayName || "Me",
                }));
              }
              setShowForm(true);
            }}
          >
            <Plus size={14} /> {isAdmin ? "Assign Task" : "New Task"}
          </button>
        </div>
      </div>

      {/* ── Employee Personal Performance Banner ── */}
      {!isAdmin && personalProgress && (
        <div
          className="card"
          style={{
            padding: "16px 20px",
            marginBottom: 20,
            background: "var(--bg-secondary)",
            borderLeft: "4px solid var(--brand-red)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Your Task Progress & Activity</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {personalProgress.completed} of {personalProgress.total} tasks approved by Admin ({personalProgress.percent}% completed)
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, maxWidth: 450 }}>
            <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${personalProgress.percent}%`,
                  background: "linear-gradient(90deg, #6366f1, #22c55e)",
                  borderRadius: 99,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{personalProgress.percent}%</span>
          </div>

          <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
            <span className="badge" style={{ background: "rgba(99, 102, 241, 0.12)", color: "var(--accent-blue)" }}>
              {personalProgress.inProgress} In Progress
            </span>
            <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)" }}>
              {personalProgress.underReview} Under Review
            </span>
            {personalProgress.overdue > 0 && (
              <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)" }}>
                {personalProgress.overdue} Overdue
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Search Bar ── */}
      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          className="input-base"
          placeholder="Filter tasks by title or assignee…"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Loading tasks…</span>
        </div>
      )}

      {/* ── Kanban View ── */}
      {!loading && viewMode === "kanban" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(280px, 1fr))",
            gap: 16,
            alignItems: "start",
            minHeight: 300,
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {COLUMNS.map(({ status, label, color }) => {
            const col = filteredTasks.filter((t) => t.status === status);
            const isOver = overColumn === status;

            return (
              <div
                key={status}
                onDragOver={(e) => onColumnDragOver(e, status)}
                onDrop={(e) => onColumnDrop(e, status)}
                onDragLeave={onColumnDragLeave}
                style={{
                  minHeight: 160,
                  borderRadius: "var(--radius)",
                  border: isOver ? `2px dashed ${color}` : "2px dashed transparent",
                  padding: 4,
                  transition: "border-color 0.15s, background 0.15s",
                  background: isOver ? `${color}18` : "transparent",
                }}
              >
                {/* Column header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      padding: "1px 8px",
                      borderRadius: 99,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                    }}
                  >
                    {col.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.map((t) => {
                    const overdue = isTaskOverdue(t);
                    const delayed = isSubmissionDelayed(t);

                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, t.id)}
                        onDragEnd={onDragEnd}
                        className="card"
                        style={{
                          padding: "14px 16px",
                          cursor: "grab",
                          opacity: draggingId === t.id ? 0.35 : 1,
                          transition: "opacity 0.15s, box-shadow 0.15s",
                          boxShadow: draggingId === t.id ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
                          borderLeft: overdue
                            ? "4px solid var(--accent-red)"
                            : `3px solid ${PRIORITY_COLOR[t.priority] ?? "var(--border)"}`,
                        }}
                      >
                        {/* Header: Priority, Overdue indicator, and Grip */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span
                              className="badge"
                              style={{ background: PRIORITY_BG[t.priority], color: PRIORITY_COLOR[t.priority], fontSize: 10 }}
                            >
                              {t.priority}
                            </span>
                            {overdue && (
                              <span
                                className="badge"
                                style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)", fontSize: 9, fontWeight: 700 }}
                              >
                                Overdue
                              </span>
                            )}
                            {delayed && (
                              <span
                                className="badge"
                                style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)", fontSize: 9 }}
                              >
                                Delayed Submit
                              </span>
                            )}
                          </div>
                          <GripVertical size={13} color="var(--text-muted)" />
                        </div>

                        {/* Title & Description */}
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>{t.title}</div>
                        {t.desc && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
                            {t.desc}
                          </div>
                        )}

                        {/* Changes requested banner */}
                        {t.lastReviewComment && t.status === "In Progress" && (
                          <div
                            style={{
                              background: "rgba(245, 158, 11, 0.1)",
                              border: "1px solid rgba(245, 158, 11, 0.25)",
                              borderRadius: 4,
                              padding: "6px 8px",
                              fontSize: 11,
                              color: "var(--accent-amber)",
                              marginBottom: 8,
                            }}
                          >
                            <strong>Changes Requested:</strong> {t.lastReviewComment}
                          </div>
                        )}

                        {/* Assignee & Deadline */}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <User size={11} /> {(t.assigneeName || "Unassigned").split(" ")[0]}
                          </span>
                          {t.deadline && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                color: overdue ? "var(--accent-red)" : "inherit",
                                fontWeight: overdue ? 700 : 500,
                              }}
                            >
                              <Calendar size={11} /> {formatDate(t.deadline)}
                            </span>
                          )}
                        </div>

                        {/* ── Action Buttons per status ── */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                          {/* Employee: Start Task */}
                          {!isAdmin && t.status === "Pending" && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: "4px 10px", fontSize: 11, flex: 1 }}
                              onClick={() => moveTask(t.id, "In Progress")}
                            >
                              Start Task
                            </button>
                          )}

                          {/* Employee: Submit for Review */}
                          {!isAdmin && t.status === "In Progress" && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: "4px 10px", fontSize: 11, flex: 1, background: "var(--accent-amber)", color: "#000" }}
                              onClick={() => setSubmitTaskTarget(t)}
                            >
                              Submit for Review
                            </button>
                          )}

                          {/* Employee: Waiting for review */}
                          {!isAdmin && t.status === "Under Review" && (
                            <div style={{ fontSize: 11, color: "var(--accent-amber)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={12} /> Awaiting Admin Approval
                            </div>
                          )}

                          {/* Admin: Review button on Under Review card */}
                          {isAdmin && t.status === "Under Review" && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: "4px 10px", fontSize: 11, flex: 1, background: "var(--accent-amber)", color: "#000" }}
                              onClick={() => {
                                setReviewModalTask(t);
                                setReviewActionType("approve");
                                setOverrideStatusVal("Completed");
                              }}
                            >
                              Review & Decision
                            </button>
                          )}

                          {/* Admin: Reopen button on Completed card */}
                          {isAdmin && t.status === "Completed" && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "3px 8px", fontSize: 11, gap: 4 }}
                              onClick={() => {
                                setReviewModalTask(t);
                                setReviewActionType("override");
                                setOverrideStatusVal("In Progress");
                              }}
                            >
                              <RotateCcw size={12} /> Reopen
                            </button>
                          )}

                          {/* Admin Override Dropdown */}
                          {isAdmin && (
                            <div style={{ position: "relative", minWidth: 100 }}>
                              <select
                                className="input-base"
                                style={{ fontSize: 10, padding: "3px 20px 3px 6px", appearance: "none" }}
                                value={t.status}
                                onChange={(e) => {
                                  const targetVal = e.target.value as TaskStatus;
                                  setReviewModalTask(t);
                                  setReviewActionType("override");
                                  setOverrideStatusVal(targetVal);
                                }}
                              >
                                {TASK_STATUS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={10} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
                            </div>
                          )}

                          {/* History / Timeline Icon */}
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "4px 6px", marginLeft: "auto" }}
                            title="View Activity History"
                            onClick={() => setTimelineTask(t)}
                          >
                            <History size={13} color="var(--text-muted)" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {col.length === 0 && (
                    <div
                      style={{
                        padding: "28px 16px",
                        textAlign: "center",
                        fontSize: 12,
                        color: "var(--text-muted)",
                        border: "1px dashed var(--border)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      Drag tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List View ── */}
      {!loading && viewMode === "list" && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Start Date</th>
                <th>Deadline</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t) => {
                const colColor = COLUMNS.find((c) => c.status === t.status)?.color ?? "var(--text-muted)";
                const overdue = isTaskOverdue(t);

                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>
                      {t.desc && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{t.desc}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t.assigneeName}</td>
                    <td>
                      <span className="badge" style={{ background: PRIORITY_BG[t.priority], color: PRIORITY_COLOR[t.priority] }}>
                        {t.priority}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {t.startDate ? formatDate(t.startDate) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: overdue ? "var(--accent-red)" : "var(--text-muted)", fontWeight: overdue ? 700 : 500 }}>
                      {t.deadline ? formatDate(t.deadline) : "—"}
                    </td>
                    <td>
                      <span className="badge" style={{ background: `${colColor}20`, color: colColor, fontWeight: 600 }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        {!isAdmin && t.status === "In Progress" && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "3px 8px", fontSize: 11 }}
                            onClick={() => setSubmitTaskTarget(t)}
                          >
                            Submit Review
                          </button>
                        )}
                        {isAdmin && t.status === "Under Review" && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: "3px 8px", fontSize: 11, background: "var(--accent-amber)", color: "#000" }}
                            onClick={() => {
                              setReviewModalTask(t);
                              setReviewActionType("approve");
                            }}
                          >
                            Review
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 6px" }}
                          onClick={() => setTimelineTask(t)}
                        >
                          <History size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!loading && tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-muted)" }}>
          <ClipboardList size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>
            {isAdmin ? "No tasks yet. Assign one to get started." : "No tasks assigned to you yet."}
          </p>
        </div>
      )}

      {/* ── MODAL: SUBMIT FOR REVIEW (EMPLOYEE) ── */}
      {submitTaskTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSubmitTaskTarget(null)}
        >
          <div
            className="card"
            style={{ width: 500, padding: 28, background: "var(--bg-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Submit Task for Admin Review</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{submitTaskTarget.title}</p>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setSubmitTaskTarget(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Work Summary / Completion Notes *
                </label>
                <textarea
                  required
                  className="input-base"
                  rows={3}
                  placeholder="Describe the work completed, tested features, or key updates…"
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Proof / Demo URL (Optional)
                </label>
                <input
                  type="url"
                  className="input-base"
                  placeholder="https://github.com/... or staging link"
                  value={submissionProofURL}
                  onChange={(e) => setSubmissionProofURL(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, background: "var(--accent-amber)", color: "#000" }}
                  onClick={handleConfirmSubmission}
                  disabled={submittingWork || !submissionNotes.trim()}
                >
                  {submittingWork ? <Loader2 size={14} className="animate-spin" /> : "Submit for Approval"}
                </button>
                <button className="btn btn-secondary" onClick={() => setSubmitTaskTarget(null)} disabled={submittingWork}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADMIN REVIEW & OVERRIDE DECISION ── */}
      {reviewModalTask && reviewActionType && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setReviewModalTask(null);
            setReviewActionType(null);
          }}
        >
          <div
            className="card"
            style={{ width: 520, padding: 28, background: "var(--bg-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                {reviewActionType === "approve"
                  ? "Approve Work & Complete Task"
                  : reviewActionType === "changes_requested"
                  ? "Request Modifications"
                  : reviewActionType === "reject"
                  ? "Reject Submission"
                  : "Administrative Status Override"}
              </h3>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 8px" }}
                onClick={() => {
                  setReviewModalTask(null);
                  setReviewActionType(null);
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 14, fontSize: 13 }}>
              Task: <strong>{reviewModalTask.title}</strong>
              <br />
              Assignee: <strong>{reviewModalTask.assigneeName}</strong>
            </div>

            {/* If employee provided submission notes, display them */}
            {reviewModalTask.submissionNotes && (
              <div
                style={{
                  background: "var(--bg-secondary)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 2 }}>
                  Employee Submission:
                </span>
                {reviewModalTask.submissionNotes}
                {reviewModalTask.proofURL && (
                  <div style={{ marginTop: 4 }}>
                    <a
                      href={reviewModalTask.proofURL}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent-blue)", textDecoration: "underline" }}
                    >
                      View Attached Work Proof
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Target Status if Override */}
            {reviewActionType === "override" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Target Status:
                </label>
                <select
                  className="input-base"
                  value={overrideStatusVal}
                  onChange={(e) => setOverrideStatusVal(e.target.value as TaskStatus)}
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Completed">Completed (Approved)</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            )}

            {/* Comment */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                {reviewActionType === "override"
                  ? "Audit Override Reason *"
                  : reviewActionType === "changes_requested"
                  ? "Required Modifications / Feedback *"
                  : reviewActionType === "reject"
                  ? "Rejection Reason *"
                  : "Approval Comments (Optional):"}
              </label>
              <textarea
                className="input-base"
                rows={3}
                placeholder="Reason or feedback recorded in the immutable audit log…"
                value={adminReviewComment}
                onChange={(e) => setAdminReviewComment(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setReviewModalTask(null);
                  setReviewActionType(null);
                }}
                disabled={executingReview}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{
                  background:
                    reviewActionType === "approve"
                      ? "var(--accent-green)"
                      : reviewActionType === "reject"
                      ? "var(--accent-red)"
                      : "var(--brand-red)",
                  color: reviewActionType === "approve" ? "#000" : "#fff",
                }}
                onClick={handleExecuteAdminDecision}
                disabled={executingReview}
              >
                {executingReview ? <Loader2 size={14} className="animate-spin" /> : "Confirm Action"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TASK ACTIVITY TIMELINE ── */}
      {timelineTask && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setTimelineTask(null)}
        >
          <div
            className="card"
            style={{ width: 560, padding: 28, background: "var(--bg-primary)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Task Activity Timeline & Time Tracking</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{timelineTask.title}</p>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setTimelineTask(null)}>
                <X size={16} />
              </button>
            </div>

            {/* Time Metrics Grid */}
            <div
              style={{
                background: "var(--bg-secondary)",
                padding: 14,
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>Start Date:</span>{" "}
                <strong>{timelineTask.startDate ? formatDate(timelineTask.startDate) : "—"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Deadline:</span>{" "}
                <strong>{timelineTask.deadline ? formatDate(timelineTask.deadline) : "None"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Actual Start Time:</span>{" "}
                <strong>
                  {timelineTask.actualStartTime
                    ? formatDateTime(toDateObj(timelineTask.actualStartTime))
                    : "Not started yet"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Submitted At:</span>{" "}
                <strong>
                  {timelineTask.submittedAt
                    ? formatDateTime(toDateObj(timelineTask.submittedAt))
                    : "Not submitted yet"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Approved At:</span>{" "}
                <strong>
                  {timelineTask.approvedAt
                    ? formatDateTime(toDateObj(timelineTask.approvedAt))
                    : "Pending approval"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Status:</span>{" "}
                <strong>{timelineTask.status}</strong>
              </div>
            </div>

            {/* Timeline Entries */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Audit Log Entries</div>
            {taskAuditLogs.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                No audit entries recorded for this task yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {taskAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-sm)",
                      borderLeft: "3px solid var(--brand-red)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: "var(--brand-red)" }}>{log.action}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {log.timestamp ? formatDateTime(log.timestamp) : "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12 }}>{log.description}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>By: {log.actorName}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE TASK MODAL ── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="card"
            style={{ padding: 32, width: 500, background: "var(--bg-primary)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{isAdmin ? "Assign New Task" : "Create New Task"}</div>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setShowForm(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Task title */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Task Title <span style={{ color: "var(--accent-red)" }}>*</span>
                </label>
                <input
                  id="task-title"
                  className="input-base"
                  placeholder="e.g. Update employee handbook"
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                />
              </div>

              {/* Assignee picker */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Assign To <span style={{ color: "var(--accent-red)" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    id="task-assignee"
                    className="input-base"
                    style={{ appearance: "none", paddingRight: 32 }}
                    value={newTask.assigneeId}
                    onChange={(e) => {
                      const emp = employees.find((em) => em.uid === e.target.value);
                      setNewTask((p) => ({
                        ...p,
                        assigneeId: e.target.value,
                        assigneeName: emp?.name ?? "",
                      }));
                    }}
                  >
                    <option value="">— Select Employee —</option>
                    {employees.map((emp) => (
                      <option key={emp.uid} value={emp.uid}>
                        {emp.name} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  id="task-desc"
                  className="input-base"
                  rows={3}
                  placeholder="Describe the task in detail…"
                  value={newTask.desc}
                  onChange={(e) => setNewTask((p) => ({ ...p, desc: e.target.value }))}
                />
              </div>

              {/* Start Date & Deadline */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="input-base"
                    value={newTask.startDate}
                    onChange={(e) => setNewTask((p) => ({ ...p, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Deadline <span style={{ color: "var(--accent-red)" }}>*</span>
                  </label>
                  <input
                    id="task-deadline"
                    type="date"
                    className="input-base"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))}
                  />
                </div>
              </div>

              {/* Priority & Estimated Effort */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Priority
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      id="task-priority"
                      className="input-base"
                      style={{ appearance: "none", paddingRight: 32 }}
                      value={newTask.priority}
                      onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value as TaskPriority }))}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Critical">Critical</option>
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Estimated Effort (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="input-base"
                    value={newTask.estimatedHours}
                    onChange={(e) => setNewTask((p) => ({ ...p, estimatedHours: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                id="task-submit"
                className="btn btn-primary"
                style={{ flex: 1, gap: 6, background: "var(--brand-red)" }}
                onClick={addTask}
                disabled={saving}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {saving ? "Saving…" : (isAdmin ? "Assign Task" : "Create Task")}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
