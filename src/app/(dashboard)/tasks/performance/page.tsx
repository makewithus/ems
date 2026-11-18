"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Search,
  Filter,
  Plus,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  FileCheck2,
  ExternalLink,
  History,
  RotateCcw,
  Sparkles,
  Layers,
  Calendar,
  Hourglass,
  SlidersHorizontal,
  X,
  Loader2,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { Task, TaskPriority, TaskStatus, TaskActivityLog, Role } from "@/types";
import { formatDate, formatDateTime, timeAgo, formatDeadlineHealth, isValidUrl } from "@/lib/utils";
import {
  calculateEmployeeWorkloads,
  calculateProgress,
  isTaskCompleted,
  isTaskUnderReview,
  isTaskInProgress,
  isTaskPending,
  isTaskOverdue,
  isSubmissionDelayed,
  transitionTaskStatus,
  EmployeeWorkload,
  toDateObj,
} from "@/lib/taskService";
import { toast } from "sonner";

export default function TeamPerformancePage() {
  const { user, profile, role } = useAuthStore();
  const isAdmin = role === "super_admin" || role === "hr_admin";

  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<
    { uid: string; name: string; employeeId: string; department?: string; designation?: string; photoURL?: string }[]
  >([]);
  const [auditLogs, setAuditLogs] = useState<TaskActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [workloadFilter, setWorkloadFilter] = useState<string>("all");
  const [selectedEmployeeUid, setSelectedEmployeeUid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "reviewQueue" | "deadlines" | "audit">("overview");

  // Review & Override Modals
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [reviewActionType, setReviewActionType] = useState<"approve" | "changes_requested" | "reject" | "override" | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [overrideTargetStatus, setOverrideTargetStatus] = useState<TaskStatus>("Completed");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Task Detail Modal for Timeline
  const [timelineTask, setTimelineTask] = useState<Task | null>(null);

  // Employee Submission Modal
  const [submitTaskTarget, setSubmitTaskTarget] = useState<Task | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionProofURL, setSubmissionProofURL] = useState("");
  const [submittingWork, setSubmittingWork] = useState(false);

  // Quick Assign Task Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    title: "",
    desc: "",
    assigneeId: "",
    assigneeName: "",
    startDate: new Date().toISOString().split("T")[0],
    deadline: "",
    priority: "Medium" as TaskPriority,
    estimatedHours: 8,
  });
  const [savingTask, setSavingTask] = useState(false);

  /* ── 1. Real-time Employees Listener (Deduplicated from authoritative employees collection) ── */
  useEffect(() => {
    if (!user?.uid) return;
    if (!isAdmin) {
      setEmployees([
        {
          uid: user.uid,
          name: profile?.displayName || user.displayName || user.email || "Me",
          employeeId: profile?.employeeId || "EMP",
          department: profile?.department || "General",
          designation: profile?.designation || (role === "employee" ? "Employee" : "Team Member"),
          photoURL: profile?.photoURL,
        },
      ]);
      return;
    }

    const unsubEmployees = onSnapshot(
      collection(db, "employees"),
      (snap) => {
        const seenEmpIds = new Set<string>();
        const seenNames = new Set<string>();
        const empList: {
          uid: string;
          name: string;
          employeeId: string;
          department?: string;
          designation?: string;
          photoURL?: string;
        }[] = [];

        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.status === "Archived") return;

          const empId = data.employeeId || d.id;
          const fullName = `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || data.email || empId;
          const normName = fullName.toLowerCase().replace(/\s+/g, " ");

          if (seenEmpIds.has(empId) || (normName && seenNames.has(normName))) return;
          seenEmpIds.add(empId);
          if (normName) seenNames.add(normName);

          empList.push({
            uid: data.uid || d.id,
            name: fullName,
            employeeId: empId,
            department: data.department || "General",
            designation: data.designation || "Employee",
            photoURL: data.photoURL,
          });
        });

        empList.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(empList);
      },
      (err) => console.error("Error fetching employees:", err)
    );

    return () => unsubEmployees();
  }, [isAdmin, user?.uid, profile?.displayName, user?.displayName, user?.email, profile?.employeeId, profile?.department, profile?.designation, profile?.photoURL, role]);

  /* ── 2. Real-time Tasks Listener ── */
  useEffect(() => {
    if (!user?.uid) return;

    const taskMap = new Map<string, Task>();

    const mergeAndSet = () => {
      const taskList = Array.from(taskMap.values());
      taskList.sort((a, b) => {
        const aTime = (a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
        const bTime = (b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });
      setTasks(taskList);
      setLoading(false);
    };

    const mapDoc = (d: import("firebase/firestore").QueryDocumentSnapshot) => {
      const data = d.data();
      return {
        id: d.id,
        companyId: data.companyId || "default",
        title: data.title || "",
        desc: data.desc || data.description || "",
        startDate: data.startDate || "",
        deadline: data.deadline || "",
        priority: data.priority || "Medium",
        status: data.status || "Pending",
        assigneeId: data.assigneeId || data.assignedTo || "",
        assigneeName: data.assigneeName || data.assignedToName || "Unassigned",
        assignedTo: data.assignedTo || data.assigneeId || "",
        estimatedHours: data.estimatedHours || 0,
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
        progress: data.progress || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        ...(data.activityHistory ? { activityHistory: data.activityHistory } : {}),
      } as Task;
    };

    if (isAdmin) {
      const qTasks = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(
        qTasks,
        (snap) => {
          taskMap.clear();
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        (err) => {
          console.error("Error fetching tasks:", err);
          setLoading(false);
        }
      );
      return () => unsub();
    } else {
      const q1 = query(collection(db, "tasks"), where("assigneeId", "==", user.uid));
      const q2 = query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
      const q3 = query(collection(db, "tasks"), where("createdByUid", "==", user.uid));

      const unsub1 = onSnapshot(
        q1,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        (err) => {
          console.error("Error fetching tasks (assigneeId):", err);
          setLoading(false);
        }
      );
      const unsub2 = onSnapshot(
        q2,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        () => setLoading(false)
      );
      const unsub3 = onSnapshot(
        q3,
        (snap) => {
          snap.docs.forEach((d) => taskMap.set(d.id, mapDoc(d)));
          mergeAndSet();
        },
        () => setLoading(false)
      );

      return () => {
        unsub1();
        unsub2();
        unsub3();
      };
    }
  }, [isAdmin, user?.uid]);

  /* ── 3. Real-time Task Audit Logs Listener ── */
  useEffect(() => {
    if (!user?.uid) return;
    const qLogs = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"));
    const unsubLogs = onSnapshot(
      qLogs,
      (snap) => {
        const logs = (snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TaskActivityLog[])
          .filter((log) => log.module === "EMS_TASKS" || log.entityType === "TASK" || log.entityType === "task");
        setAuditLogs(logs);
      },
      (err) => console.error("Error fetching audit logs:", err)
    );

    return () => unsubLogs();
  }, [user?.uid]);

  /* ── 4. Derived Team Performance & Workloads ── */
  const employeeWorkloads = useMemo(() => {
    return calculateEmployeeWorkloads(employees, tasks);
  }, [employees, tasks]);

  // Overall Team Stats
  const teamMetrics = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => isTaskCompleted(t.status)).length;
    const underReviewTasks = tasks.filter((t) => isTaskUnderReview(t.status)).length;
    const inProgressTasks = tasks.filter((t) => isTaskInProgress(t.status)).length;
    const pendingTasks = tasks.filter((t) => isTaskPending(t.status)).length;
    const overdueTasks = tasks.filter((t) => isTaskOverdue(t)).length;

    const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const overloadedCount = employeeWorkloads.filter((e) => e.workloadState === "overloaded").length;
    const fallingBehindCount = employeeWorkloads.filter((e) => e.workloadState === "falling_behind").length;
    const optimalCount = employeeWorkloads.filter((e) => e.workloadState === "optimal" || e.workloadState === "completed").length;

    return {
      totalTasks,
      completedTasks,
      underReviewTasks,
      inProgressTasks,
      pendingTasks,
      overdueTasks,
      overallProgress,
      overloadedCount,
      fallingBehindCount,
      optimalCount,
    };
  }, [tasks, employeeWorkloads]);

  // Filtered Employees
  const filteredWorkloads = useMemo(() => {
    return employeeWorkloads.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.department && emp.department.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesWorkload =
        workloadFilter === "all" ||
        (workloadFilter === "overloaded" && emp.workloadState === "overloaded") ||
        (workloadFilter === "falling_behind" && emp.workloadState === "falling_behind") ||
        (workloadFilter === "optimal" && (emp.workloadState === "optimal" || emp.workloadState === "completed")) ||
        (workloadFilter === "completed" && emp.workloadState === "completed");

      return matchesSearch && matchesWorkload;
    });
  }, [employeeWorkloads, searchQuery, workloadFilter]);

  // Tasks under review
  const reviewQueueTasks = useMemo(() => {
    return tasks.filter((t) => isTaskUnderReview(t.status));
  }, [tasks]);

  // Overdue and upcoming deadline tasks
  const overdueAndUpcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => !isTaskCompleted(t.status) && t.deadline)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
  }, [tasks]);

  // Tasks for selected employee
  const selectedEmployeeTasks = useMemo(() => {
    if (!selectedEmployeeUid) return [];
    return tasks.filter((t) => t.assigneeId === selectedEmployeeUid || t.assignedTo === selectedEmployeeUid);
  }, [tasks, selectedEmployeeUid]);

  /* ── 5. Review Action Execution ── */
  const handleExecuteReview = async () => {
    if (!reviewTask || !reviewActionType) return;
    setSubmittingReview(true);

    try {
      let targetStatus: TaskStatus = "In Progress";
      if (reviewActionType === "approve") {
        targetStatus = "Completed";
      } else if (reviewActionType === "override") {
        targetStatus = overrideTargetStatus;
      } else if (reviewActionType === "changes_requested" || reviewActionType === "reject") {
        targetStatus = "In Progress";
      }

      const res = await transitionTaskStatus({
        taskId: reviewTask.id,
        currentTask: reviewTask,
        targetStatus,
        actor: {
          uid: user?.uid || "admin",
          displayName: profile?.displayName || user?.displayName || "Admin",
          role: role || "super_admin",
          companyId: profile?.companyId || "default",
        },
        reviewAction: reviewActionType,
        comment: reviewComment.trim(),
      });

      if (res.success) {
        toast.success(
          reviewActionType === "approve"
            ? "Task approved and marked as Completed!"
            : reviewActionType === "changes_requested"
            ? "Modification request sent to employee."
            : reviewActionType === "reject"
            ? "Task rejected."
            : "Task status overridden successfully."
        );
        setReviewTask(null);
        setReviewActionType(null);
        setReviewComment("");
      } else {
        toast.error(res.error || "Failed to process review action");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmittingReview(false);
    }
  };

  /* ── 5.1 Employee Submits Work for Review ── */
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
        toast.success("Work submitted for Admin Review! Status updated to Under Review.");
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

  /* ── 5.2 Employee Starts Pending Task ── */
  const handleStartTask = async (task: Task) => {
    try {
      const res = await transitionTaskStatus({
        taskId: task.id,
        currentTask: task,
        targetStatus: "In Progress",
        actor: {
          uid: user?.uid || "user",
          displayName: profile?.displayName || user?.displayName || "Employee",
          role: role || "employee",
          companyId: profile?.companyId || "default",
        },
        comment: "Task started by employee",
      });

      if (res.success) {
        toast.success(`Task "${task.title}" is now In Progress!`);
      } else {
        toast.error(res.error || "Failed to start task");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start task");
    }
  };

  /* ── 6. Assign New Task ── */
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    if (!assignForm.assigneeId) {
      toast.error("Please select an assignee");
      return;
    }
    if (!assignForm.deadline) {
      toast.error("Please set an expected completion deadline");
      return;
    }

    setSavingTask(true);
    try {
      const companyId = profile?.companyId || "default";
      const creatorName = profile?.displayName || user?.displayName || "Admin";

      const taskDocRef = await addDoc(collection(db, "tasks"), {
        companyId,
        title: assignForm.title.trim(),
        desc: assignForm.desc.trim(),
        description: assignForm.desc.trim(),
        startDate: assignForm.startDate,
        deadline: assignForm.deadline,
        priority: assignForm.priority,
        estimatedHours: Number(assignForm.estimatedHours) || 0,
        status: "Pending",
        progress: 0,
        assigneeId: assignForm.assigneeId,
        assigneeName: assignForm.assigneeName,
        assignedTo: assignForm.assigneeId,
        assignedToName: assignForm.assigneeName,
        createdBy: creatorName,
        createdByUid: user?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Write initial audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: new Date().toISOString(),
        actorId: user?.uid || "admin",
        actorName: creatorName,
        actorRole: role || "super_admin",
        action: "CREATED",
        entityType: "TASK",
        entityId: taskDocRef.id,
        description: `${creatorName} created and assigned task "${assignForm.title.trim()}" to ${assignForm.assigneeName} with deadline ${assignForm.deadline}`,
        module: "EMS_TASKS",
        taskTitle: assignForm.title.trim(),
        prevStatus: "None",
        newStatus: "Pending",
        createdAt: serverTimestamp(),
      });

      // Dispatch notification
      await addDoc(collection(db, "notifications"), {
        companyId,
        userId: assignForm.assigneeId,
        senderUid: user?.uid || "admin",
        createdBy: user?.uid || "admin",
        title: "New Task Assigned",
        message: `${creatorName} assigned you: "${assignForm.title.trim()}" (Deadline: ${formatDate(assignForm.deadline)})`,
        type: "task",
        isRead: false,
        link: "/tasks",
        createdAt: serverTimestamp(),
      });

      toast.success("Task assigned successfully!");
      setShowAssignModal(false);
      setAssignForm({
        title: "",
        desc: "",
        assigneeId: "",
        assigneeName: "",
        startDate: new Date().toISOString().split("T")[0],
        deadline: "",
        priority: "Medium",
        estimatedHours: 8,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSavingTask(false);
    }
  };

  /* ── 7. Render ── */
  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 64 }}>
      {/* ── Top Navigation Tabs & Page Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              className="badge"
              style={{
                background: "rgba(229, 62, 62, 0.15)",
                color: "var(--brand-red)",
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: "0.08em",
              }}
            >
              {isAdmin ? "ADMIN OVERSIGHT" : "EMPLOYEE TRACKING"}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>• MakeWithUs EMS</span>
          </div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>
            {isAdmin ? "Team Performance & Task Tracking" : "My Performance & Task Tracking"}
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13 }}>
            {isAdmin
              ? "Real-time team workload distribution, progress analytics, and task tracking"
              : "Personal workload metrics, progress analytics, and task review tracking"}
          </p>
        </div>

        {/* View Switcher: Task Board vs Team Performance */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: 3,
              gap: 2,
            }}
          >
            <Link
              href="/tasks"
              className="btn btn-ghost"
              style={{ padding: "6px 14px", fontSize: 12, gap: 6, textDecoration: "none" }}
            >
              <ClipboardList size={14} /> Task Board
            </Link>
            <button
              className="btn btn-primary"
              style={{ padding: "6px 14px", fontSize: 12, gap: 6, background: "var(--brand-red)" }}
            >
              <TrendingUp size={14} /> Performance & Tracking
            </button>
          </div>

          {isAdmin && (
            <button
              className="btn btn-primary"
              style={{ gap: 6, background: "var(--brand-red)", padding: "7px 16px" }}
              onClick={() => setShowAssignModal(true)}
            >
              <Plus size={15} /> Assign Task
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Metrics Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Total Tasks & Overall Progress */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {isAdmin ? "Team Progress" : "My Progress"}
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(99, 102, 241, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-blue)",
              }}
            >
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>
              {teamMetrics.overallProgress}%
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              ({teamMetrics.completedTasks}/{teamMetrics.totalTasks} approved)
            </span>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${teamMetrics.overallProgress}%`,
                background: "linear-gradient(90deg, #6366f1, #22c55e)",
                borderRadius: 99,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* Active Workload */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Active Workload
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(59, 130, 246, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-blue)",
              }}
            >
              <Hourglass size={16} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>
              {teamMetrics.inProgressTasks + teamMetrics.pendingTasks}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>tasks</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--accent-blue)", fontWeight: 600 }}>{teamMetrics.inProgressTasks} in progress</span> •{" "}
            <span>{teamMetrics.pendingTasks} pending start</span>
          </div>
        </div>

        {/* Under Review Queue */}
        <div
          className="card"
          style={{
            padding: "18px 20px",
            borderLeft: teamMetrics.underReviewTasks > 0 ? "4px solid var(--accent-amber)" : undefined,
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("reviewQueue")}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Under Review
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(245, 158, 11, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-amber)",
              }}
            >
              <FileCheck2 size={16} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: teamMetrics.underReviewTasks > 0 ? "var(--accent-amber)" : "inherit" }}>
              {teamMetrics.underReviewTasks}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>awaiting review</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: teamMetrics.underReviewTasks > 0 ? "var(--accent-amber)" : "var(--accent-green)",
              fontWeight: 500,
            }}
          >
            {teamMetrics.underReviewTasks > 0 ? (
              <>
                <AlertCircle size={12} style={{ flexShrink: 0 }} />
                <span>Requires admin decision</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                <span>Review queue clear</span>
              </>
            )}
          </div>
        </div>

        {/* Overdue Tasks Alert */}
        <div
          className="card"
          style={{
            padding: "18px 20px",
            borderLeft: teamMetrics.overdueTasks > 0 ? "4px solid var(--accent-red)" : undefined,
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("deadlines")}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Overdue Tasks
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-red)",
              }}
            >
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: teamMetrics.overdueTasks > 0 ? "var(--accent-red)" : "inherit" }}>
              {teamMetrics.overdueTasks}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>past deadline</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: teamMetrics.overdueTasks > 0 ? "var(--accent-red)" : "var(--accent-green)",
              fontWeight: 500,
            }}
          >
            {teamMetrics.overdueTasks > 0 ? (
              <>
                <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                <span>Attention required</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                <span>All deadlines on track</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Team Workload Health Summary Banner ── */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          marginBottom: 24,
          background: "var(--bg-secondary)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(229, 62, 62, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--brand-red)",
            }}
          >
            <Users size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {isAdmin ? "Team Workload & Capacity Overview" : "My Workload & Capacity Overview"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {isAdmin
                ? `${employees.length} team members monitored dynamically • Identifying overloaded and delayed staff`
                : "Real-time summary of your assigned tasks, active workload, and delivery status"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "6px 12px",
              background: "rgba(239, 68, 68, 0.1)",
              borderRadius: 6,
              color: "var(--accent-red)",
              fontWeight: 600,
            }}
          >
            <ShieldAlert size={14} /> {teamMetrics.fallingBehindCount} Falling Behind
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "6px 12px",
              background: "rgba(245, 158, 11, 0.1)",
              borderRadius: 6,
              color: "var(--accent-amber)",
              fontWeight: 600,
            }}
          >
            <AlertCircle size={14} /> {teamMetrics.overloadedCount} Overloaded
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "6px 12px",
              background: "rgba(34, 197, 94, 0.1)",
              borderRadius: 6,
              color: "var(--accent-green)",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={14} /> {teamMetrics.optimalCount} Optimal / Balanced
          </div>
        </div>
      </div>

      {/* ── Sub-navigation Tabs ── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          gap: 16,
          marginBottom: 20,
          overflowX: "auto",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 2,
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          style={{
            padding: "10px 4px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "overview" ? "2px solid var(--brand-red)" : "2px solid transparent",
            color: activeTab === "overview" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: activeTab === "overview" ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {isAdmin ? <Users size={15} /> : <ClipboardList size={15} />}
          <span>{isAdmin ? `All Employees (${employeeWorkloads.length})` : `My Tasks (${employeeWorkloads[0]?.totalTasks || 0})`}</span>
        </button>

        <button
          onClick={() => setActiveTab("reviewQueue")}
          style={{
            padding: "10px 4px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "reviewQueue" ? "2px solid var(--brand-red)" : "2px solid transparent",
            color: activeTab === "reviewQueue" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: activeTab === "reviewQueue" ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <FileCheck2 size={15} /> {isAdmin ? "Review Queue" : "Awaiting Review"}
          {teamMetrics.underReviewTasks > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 99,
                background: "var(--accent-amber)",
                color: "#000",
                fontWeight: 700,
              }}
            >
              {teamMetrics.underReviewTasks}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("deadlines")}
          style={{
            padding: "10px 4px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "deadlines" ? "2px solid var(--brand-red)" : "2px solid transparent",
            color: activeTab === "deadlines" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: activeTab === "deadlines" ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <Calendar size={15} /> Deadlines & Overdue
          {teamMetrics.overdueTasks > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 99,
                background: "var(--accent-red)",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              {teamMetrics.overdueTasks}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          style={{
            padding: "10px 4px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "audit" ? "2px solid var(--brand-red)" : "2px solid transparent",
            color: activeTab === "audit" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: activeTab === "audit" ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <History size={15} /> Activity Timeline & Audit Logs
        </button>
      </div>

      {/* ── TAB 1: ALL EMPLOYEES & WORKLOAD TABLE ── */}
      {activeTab === "overview" && (
        <div>
          {/* Controls: Search & Workload Filter */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ position: "relative", minWidth: 280, flex: 1, maxWidth: 420 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                className="input-base"
                placeholder="Search employee by name, ID, or department…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 34, fontSize: 13 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Filter Workload:</span>
              <select
                className="input-base"
                value={workloadFilter}
                onChange={(e) => setWorkloadFilter(e.target.value)}
                style={{ fontSize: 12, padding: "6px 12px" }}
              >
                <option value="all">All Workloads ({employeeWorkloads.length})</option>
                <option value="falling_behind">Falling Behind ({teamMetrics.fallingBehindCount})</option>
                <option value="overloaded">Overloaded ({teamMetrics.overloadedCount})</option>
                <option value="optimal">Optimal ({teamMetrics.optimalCount})</option>
              </select>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 8px" }} />
              <span style={{ fontSize: 13 }}>Calculating team performance metrics…</span>
            </div>
          )}

          {/* Table */}
          {!loading && (
            <div className="table-container" style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Employee</th>
                    <th style={{ textAlign: "center" }}>Total Tasks</th>
                    <th style={{ textAlign: "center", color: "var(--accent-green)" }}>Completed</th>
                    <th style={{ textAlign: "center", color: "var(--accent-blue)" }}>In Progress</th>
                    <th style={{ textAlign: "center", color: "var(--accent-amber)" }}>Under Review</th>
                    <th style={{ textAlign: "center" }}>Pending</th>
                    <th style={{ textAlign: "center", color: "var(--accent-red)" }}>Overdue</th>
                    <th style={{ minWidth: 160 }}>Individual Progress</th>
                    <th>Workload Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkloads.map((emp) => {
                    const isSelected = selectedEmployeeUid === emp.uid;
                    return (
                      <tr
                        key={emp.uid}
                        style={{
                          background: isSelected ? "rgba(229, 62, 62, 0.06)" : undefined,
                          transition: "background 0.15s",
                        }}
                      >
                        {/* Employee Name & Details */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                background: "var(--border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 12,
                                color: "var(--text-primary)",
                                flexShrink: 0,
                              }}
                            >
                              {emp.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                {emp.employeeId} • {emp.designation || emp.department || "Employee"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Total Assigned */}
                        <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13 }}>
                          {emp.totalTasks}
                        </td>

                        {/* Completed (Approved) */}
                        <td style={{ textAlign: "center", fontWeight: 700, color: "var(--accent-green)", fontSize: 13 }}>
                          {emp.completedTasks}
                        </td>

                        {/* In Progress */}
                        <td style={{ textAlign: "center", fontWeight: 600, color: "var(--accent-blue)", fontSize: 13 }}>
                          {emp.inProgressTasks}
                        </td>

                        {/* Under Review */}
                        <td style={{ textAlign: "center", fontWeight: 600, color: emp.underReviewTasks > 0 ? "var(--accent-amber)" : "var(--text-muted)", fontSize: 13 }}>
                          {emp.underReviewTasks > 0 ? (
                            <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)" }}>
                              {emp.underReviewTasks}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>

                        {/* Pending */}
                        <td style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                          {emp.pendingTasks}
                        </td>

                        {/* Overdue */}
                        <td style={{ textAlign: "center", fontSize: 13 }}>
                          {emp.overdueTasks > 0 ? (
                            <span
                              className="badge"
                              style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)", fontWeight: 700 }}
                            >
                              {emp.overdueTasks}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>0</span>
                          )}
                        </td>

                        {/* Visual Progress Bar */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  width: `${emp.progress}%`,
                                  background:
                                    emp.progress === 100
                                      ? "var(--accent-green)"
                                      : emp.overdueTasks > 0
                                      ? "var(--accent-red)"
                                      : emp.progress >= 50
                                      ? "var(--accent-blue)"
                                      : "var(--accent-amber)",
                                  borderRadius: 99,
                                  transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, width: 36, textAlign: "right" }}>
                              {emp.progress}%
                            </span>
                          </div>
                        </td>

                        {/* Workload Status */}
                        <td>
                          <span
                            className="badge"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              background:
                                emp.workloadState === "falling_behind"
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : emp.workloadState === "overloaded"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : emp.workloadState === "completed"
                                  ? "rgba(34, 197, 94, 0.15)"
                                  : "rgba(99, 102, 241, 0.12)",
                              color:
                                emp.workloadState === "falling_behind"
                                  ? "var(--accent-red)"
                                  : emp.workloadState === "overloaded"
                                  ? "var(--accent-amber)"
                                  : emp.workloadState === "completed"
                                  ? "var(--accent-green)"
                                  : "var(--accent-blue)",
                              border:
                                emp.workloadState === "falling_behind"
                                  ? "1px solid rgba(239, 68, 68, 0.3)"
                                  : emp.workloadState === "overloaded"
                                  ? "1px solid rgba(245, 158, 11, 0.3)"
                                  : emp.workloadState === "completed"
                                  ? "1px solid rgba(34, 197, 94, 0.3)"
                                  : "1px solid rgba(99, 102, 241, 0.25)",
                              fontSize: 10.5,
                              fontWeight: 600,
                            }}
                          >
                            {emp.workloadState === "falling_behind" ? (
                              <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                            ) : emp.workloadState === "overloaded" ? (
                              <AlertCircle size={11} style={{ flexShrink: 0 }} />
                            ) : (
                              <CheckCircle2 size={11} style={{ flexShrink: 0 }} />
                            )}
                            <span>{emp.workloadLabel}</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "4px 10px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                            onClick={() => {
                              setSelectedEmployeeUid(isSelected ? null : emp.uid);
                            }}
                          >
                            <span>{isSelected ? "Hide Tasks" : "View Tasks"}</span>
                            <ChevronDown size={12} style={{ transform: isSelected ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredWorkloads.length === 0 && (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  No employees matched the current filters.
                </div>
              )}
            </div>
          )}

          {/* ── Selected Employee Expanded Tasks View ── */}
          {selectedEmployeeUid && (
            <div
              className="card"
              style={{
                marginTop: 20,
                padding: 24,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                    Assigned Tasks for {employees.find((e) => e.uid === selectedEmployeeUid)?.name}
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Individual task breakdown, actual start times, and review controls
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={() => setSelectedEmployeeUid(null)}
                >
                  <X size={16} />
                </button>
              </div>

              {selectedEmployeeTasks.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No tasks assigned to this employee.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedEmployeeTasks.map((t) => {
                    const overdue = isTaskOverdue(t);
                    const isTaskAssignee = !!user?.uid && (
                      t.assigneeId === user.uid ||
                      t.assignedTo === user.uid ||
                      (!!profile?.employeeId && (t.assigneeId === profile.employeeId || t.assignedTo === profile.employeeId))
                    );
                    return (
                      <div
                        key={t.id}
                        className="card"
                        style={{
                          padding: "14px 18px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderLeft: overdue
                            ? "4px solid var(--accent-red)"
                            : t.status === "Completed"
                            ? "4px solid var(--accent-green)"
                            : t.status === "Under Review"
                            ? "4px solid var(--accent-amber)"
                            : "4px solid var(--accent-blue)",
                        }}
                      >
                        <div style={{ flex: 1, marginRight: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</span>
                            <span
                              className="badge"
                              style={{
                                fontSize: 10,
                                background:
                                  t.status === "Completed"
                                    ? "rgba(34, 197, 94, 0.15)"
                                    : t.status === "Under Review"
                                    ? "rgba(245, 158, 11, 0.15)"
                                    : "rgba(99, 102, 241, 0.12)",
                                color:
                                  t.status === "Completed"
                                    ? "var(--accent-green)"
                                    : t.status === "Under Review"
                                    ? "var(--accent-amber)"
                                    : "var(--accent-blue)",
                              }}
                            >
                              {t.status}
                            </span>
                            {overdue && (
                              <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)", fontSize: 10 }}>
                                Overdue
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 14 }}>
                            <span>Deadline: {t.deadline ? formatDate(t.deadline) : "None"}</span>
                            {t.actualStartTime && (
                              <span>
                                Started: {formatDateTime(toDateObj(t.actualStartTime))}
                              </span>
                            )}
                            {t.submittedAt && (
                              <span style={{ color: "var(--accent-amber)" }}>
                                Submitted: {formatDateTime(toDateObj(t.submittedAt))}
                              </span>
                            )}
                            {t.approvedAt && (
                              <span style={{ color: "var(--accent-green)" }}>
                                Approved: {formatDateTime(toDateObj(t.approvedAt))} by {t.approvedBy || "Admin"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {isAdmin && t.status === "Under Review" && (
                            <button
                              className="btn btn-primary"
                              style={{ background: "var(--accent-amber)", color: "#000", padding: "5px 12px", fontSize: 11 }}
                              onClick={() => {
                                setReviewTask(t);
                                setReviewActionType("approve");
                              }}
                            >
                              Review & Decision
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "5px 10px", fontSize: 11, gap: 4 }}
                              onClick={() => {
                                setReviewTask(t);
                                setReviewActionType("override");
                                setOverrideTargetStatus(t.status);
                              }}
                            >
                              Admin Override
                            </button>
                          )}

                          {!isAdmin && isTaskAssignee && isTaskPending(t.status) && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "5px 12px", fontSize: 11, color: "var(--accent-blue)", borderColor: "rgba(59, 130, 246, 0.4)" }}
                              onClick={() => handleStartTask(t)}
                            >
                              Start Task
                            </button>
                          )}

                          {!isAdmin && isTaskAssignee && isTaskInProgress(t.status) && (
                            <button
                              className="btn btn-primary"
                              style={{ background: "var(--accent-amber)", color: "#000", padding: "5px 12px", fontSize: 11, fontWeight: 700 }}
                              onClick={() => setSubmitTaskTarget(t)}
                            >
                              Submit Work
                            </button>
                          )}

                          <button
                            className="btn btn-ghost"
                            style={{ padding: "5px 10px", fontSize: 11, gap: 4 }}
                            onClick={() => setTimelineTask(t)}
                          >
                            <History size={13} /> History
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: REVIEW QUEUE ── */}
      {activeTab === "reviewQueue" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Task Review & Approval Queue</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Work submitted by employees requiring administrative verification, modification requests, or completion approval
            </p>
          </div>

          {reviewQueueTasks.length === 0 ? (
            <div className="card" style={{ padding: "64px 0", textAlign: "center", color: "var(--text-muted)" }}>
              <FileCheck2 size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>Review Queue is Clear</p>
              <p style={{ fontSize: 12 }}>No employee tasks are currently waiting for admin review.</p>
            </div>
          ) : (
            <div className="table-container" style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Task</th>
                    <th style={{ minWidth: 150 }}>Assignee</th>
                    <th style={{ textAlign: "center", minWidth: 90 }}>Priority</th>
                    <th style={{ minWidth: 120 }}>Deadline</th>
                    <th style={{ minWidth: 130 }}>Submitted At</th>
                    <th style={{ minWidth: 240 }}>Submission Notes & Proof</th>
                    <th style={{ textAlign: "right", minWidth: 200 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewQueueTasks.map((t) => {
                    const delayed = isSubmissionDelayed(t);
                    const empData = employees.find((e) => e.uid === t.assigneeId || e.uid === t.assignedTo);

                    return (
                      <tr key={t.id}>
                        {/* Task Title & Desc */}
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 3 }}>
                            {t.title}
                          </div>
                          {t.desc && (
                            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4, maxWidth: 300 }}>
                              {t.desc}
                            </div>
                          )}
                        </td>

                        {/* Assignee */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "rgba(255, 255, 255, 0.08)",
                                border: "1px solid var(--border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 10,
                                color: "var(--text-primary)",
                                flexShrink: 0,
                              }}
                            >
                              {(t.assigneeName || "U").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text-primary)" }}>
                                {t.assigneeName || "Unassigned"}
                              </div>
                              {empData?.employeeId && (
                                <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                                  {empData.employeeId}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Priority */}
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="badge"
                            style={{
                              background:
                                t.priority === "Urgent" || t.priority === "Critical"
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : t.priority === "High"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(59, 130, 246, 0.12)",
                              color:
                                t.priority === "Urgent" || t.priority === "Critical"
                                  ? "var(--accent-red)"
                                  : t.priority === "High"
                                  ? "var(--accent-amber)"
                                  : "var(--accent-blue)",
                              fontSize: 10.5,
                              fontWeight: 700,
                            }}
                          >
                            {t.priority}
                          </span>
                        </td>

                        {/* Deadline */}
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {t.deadline ? formatDate(t.deadline) : "—"}
                        </td>

                        {/* Submitted At & Delayed Flag */}
                        <td>
                          <div style={{ fontSize: 12 }}>
                            {t.submittedAt ? formatDateTime(toDateObj(t.submittedAt)) : "Recently"}
                          </div>
                          {delayed && (
                            <span
                              className="badge"
                              style={{
                                background: "rgba(239, 68, 68, 0.15)",
                                color: "var(--accent-red)",
                                fontSize: 9.5,
                                fontWeight: 700,
                                marginTop: 4,
                                display: "inline-block",
                              }}
                            >
                              Delayed Submission
                            </span>
                          )}
                        </td>

                        {/* Submission Notes & Proof */}
                        <td>
                          {t.submissionNotes && (
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                              {t.submissionNotes}
                            </div>
                          )}
                          {t.proofURL && (
                            <div style={{ fontSize: 11.5 }}>
                              {isValidUrl(t.proofURL) ? (
                                <a
                                  href={t.proofURL}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    color: "var(--accent-blue)",
                                    textDecoration: "underline",
                                  }}
                                >
                                  <ExternalLink size={11} /> View Attached Work Proof
                                </a>
                              ) : (
                                <span style={{ color: "var(--accent-red)" }}>
                                  Invalid proof URL: {t.proofURL}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {isAdmin ? (
                              <>
                                <button
                                  className="btn btn-primary"
                                  style={{ background: "var(--accent-green)", color: "#000", padding: "5px 10px", fontSize: 11, gap: 4 }}
                                  onClick={() => {
                                    setReviewTask(t);
                                    setReviewActionType("approve");
                                  }}
                                >
                                  <CheckCircle2 size={12} /> Approve
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: "5px 10px", fontSize: 11, gap: 4 }}
                                  onClick={() => {
                                    setReviewTask(t);
                                    setReviewActionType("changes_requested");
                                  }}
                                >
                                  <MessageSquare size={12} /> Changes
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ color: "var(--accent-red)", padding: "5px 8px", fontSize: 11 }}
                                  onClick={() => {
                                    setReviewTask(t);
                                    setReviewActionType("reject");
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span
                                className="badge"
                                style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)", fontSize: 10.5 }}
                              >
                                Awaiting Admin Review
                              </span>
                            )}
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "5px 8px" }}
                              title="Activity History"
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
        </div>
      )}

      {/* ── TAB 3: DEADLINES & OVERDUE ── */}
      {activeTab === "deadlines" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Upcoming Deadlines &amp; Overdue Tasks</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Chronological schedule of incomplete tasks to identify bottlenecked work and prevent project delays
            </p>
          </div>

          {overdueAndUpcomingTasks.length === 0 ? (
            <div className="card" style={{ padding: "56px 0", textAlign: "center", color: "var(--text-muted)" }}>
              <CheckCircle2 size={38} style={{ margin: "0 auto 10px", color: "var(--accent-green)", opacity: 0.8 }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>No Overdue or Pending Deadlines</p>
              <p style={{ fontSize: 12 }}>All assigned tasks are on track and completed on schedule.</p>
            </div>
          ) : (
            <div className="table-container" style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 260 }}>Task</th>
                    <th style={{ minWidth: 160 }}>Assignee</th>
                    <th style={{ textAlign: "center", minWidth: 100 }}>Priority</th>
                    <th style={{ minWidth: 130 }}>Deadline</th>
                    <th style={{ textAlign: "center", minWidth: 130 }}>Status</th>
                    <th style={{ minWidth: 170 }}>Time Health</th>
                    <th style={{ textAlign: "right", minWidth: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueAndUpcomingTasks.map((t) => {
                    const overdue = isTaskOverdue(t);
                    const isTaskAssignee = !!user?.uid && (
                      t.assigneeId === user.uid ||
                      t.assignedTo === user.uid ||
                      (!!profile?.employeeId && (t.assigneeId === profile.employeeId || t.assignedTo === profile.employeeId))
                    );
                    const empData = employees.find((e) => e.uid === t.assigneeId || e.uid === t.assignedTo);
                    const health = formatDeadlineHealth(t.deadline);

                    return (
                      <tr
                        key={t.id}
                        style={{
                          background: overdue ? "rgba(239, 68, 68, 0.04)" : undefined,
                          transition: "background 0.15s",
                        }}
                      >
                        {/* Task Title & Description */}
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 3 }}>
                            {t.title}
                          </div>
                          {t.desc && (
                            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4, maxWidth: 380 }}>
                              {t.desc}
                            </div>
                          )}
                        </td>

                        {/* Assignee with Avatar & ID */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "rgba(255, 255, 255, 0.08)",
                                border: "1px solid var(--border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 10,
                                color: "var(--text-primary)",
                                flexShrink: 0,
                              }}
                            >
                              {(t.assigneeName || "U").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text-primary)" }}>
                                {t.assigneeName || "Unassigned"}
                              </div>
                              {empData?.employeeId && (
                                <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                                  {empData.employeeId}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Priority Badge */}
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              background:
                                t.priority === "Urgent" || t.priority === "Critical"
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : t.priority === "High"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : t.priority === "Medium"
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : "rgba(255, 255, 255, 0.06)",
                              color:
                                t.priority === "Urgent" || t.priority === "Critical"
                                  ? "var(--accent-red)"
                                  : t.priority === "High"
                                  ? "var(--accent-amber)"
                                  : t.priority === "Medium"
                                  ? "var(--accent-blue)"
                                  : "var(--text-secondary)",
                              border:
                                t.priority === "Urgent" || t.priority === "Critical"
                                  ? "1px solid rgba(239, 68, 68, 0.3)"
                                  : t.priority === "High"
                                  ? "1px solid rgba(245, 158, 11, 0.3)"
                                  : t.priority === "Medium"
                                  ? "1px solid rgba(59, 130, 246, 0.3)"
                                  : "1px solid var(--border)",
                            }}
                          >
                            {t.priority}
                          </span>
                        </td>

                        {/* Deadline */}
                        <td>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12.5,
                              fontWeight: overdue ? 700 : 500,
                              color: overdue ? "var(--accent-red)" : "var(--text-primary)",
                            }}
                          >
                            <Calendar size={13} style={{ color: overdue ? "var(--accent-red)" : "var(--text-muted)" }} />
                            <span>{t.deadline ? formatDate(t.deadline) : "—"}</span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background:
                                t.status === "Completed"
                                  ? "rgba(34, 197, 94, 0.15)"
                                  : t.status === "Under Review"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : t.status === "In Progress"
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : "rgba(255, 255, 255, 0.06)",
                              color:
                                t.status === "Completed"
                                  ? "var(--accent-green)"
                                  : t.status === "Under Review"
                                  ? "var(--accent-amber)"
                                  : t.status === "In Progress"
                                  ? "var(--accent-blue)"
                                  : "var(--text-secondary)",
                              border:
                                t.status === "Completed"
                                  ? "1px solid rgba(34, 197, 94, 0.3)"
                                  : t.status === "Under Review"
                                  ? "1px solid rgba(245, 158, 11, 0.3)"
                                  : t.status === "In Progress"
                                  ? "1px solid rgba(59, 130, 246, 0.3)"
                                  : "1px solid var(--border)",
                            }}
                          >
                            {t.status === "Completed" ? (
                              <CheckCircle2 size={11} />
                            ) : t.status === "Under Review" ? (
                              <FileCheck2 size={11} />
                            ) : t.status === "In Progress" ? (
                              <Clock size={11} />
                            ) : (
                              <Hourglass size={11} />
                            )}
                            <span>{t.status}</span>
                          </span>
                        </td>

                        {/* Time Health (Clean relative status) */}
                        <td>
                          {(() => {
                            if (!health) {
                              return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No deadline</span>;
                            }
                            if (health.status === "overdue") {
                              return (
                                <span
                                  className="badge"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    background: "rgba(239, 68, 68, 0.15)",
                                    color: "var(--accent-red)",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                    fontWeight: 700,
                                    fontSize: 11,
                                  }}
                                >
                                  <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                                  <span>{health.label}</span>
                                </span>
                              );
                            }
                            if (health.status === "today") {
                              return (
                                <span
                                  className="badge"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "var(--accent-amber)",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                    fontWeight: 700,
                                    fontSize: 11,
                                  }}
                                >
                                  <AlertCircle size={12} style={{ flexShrink: 0 }} />
                                  <span>{health.label}</span>
                                </span>
                              );
                            }
                            return (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  fontSize: 12,
                                  color: "var(--text-secondary)",
                                  fontWeight: 500,
                                }}
                              >
                                <Clock size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                <span>{health.label}</span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* Actions — Contextual & never empty */}
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            {isAdmin ? (
                              <>
                                {t.status === "Under Review" ? (
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: "4px 10px", fontSize: 11, background: "var(--accent-amber)", color: "#000", fontWeight: 700 }}
                                    onClick={() => {
                                      setReviewTask(t);
                                      setReviewActionType("approve");
                                    }}
                                  >
                                    Review
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: "4px 10px", fontSize: 11 }}
                                    onClick={() => {
                                      setReviewTask(t);
                                      setReviewActionType("override");
                                      setOverrideTargetStatus(t.status);
                                    }}
                                  >
                                    Status
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                {isTaskAssignee && isTaskPending(t.status) && (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: "4px 10px", fontSize: 11, color: "var(--accent-blue)", borderColor: "rgba(59, 130, 246, 0.4)" }}
                                    onClick={() => handleStartTask(t)}
                                  >
                                    Start
                                  </button>
                                )}
                                {isTaskAssignee && isTaskInProgress(t.status) && (
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: "4px 10px", fontSize: 11, background: "var(--accent-amber)", color: "#000", fontWeight: 700 }}
                                    onClick={() => setSubmitTaskTarget(t)}
                                  >
                                    Submit
                                  </button>
                                )}
                                {isTaskUnderReview(t.status) && (
                                  <span className="badge" style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--accent-amber)", fontSize: 10.5 }}>
                                    In Review
                                  </span>
                                )}
                              </>
                            )}
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "4px 7px" }}
                              title="View Activity History"
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
        </div>
      )}

      {/* ── TAB 4: IMMUTABLE AUDIT TIMELINE ── */}
      {activeTab === "audit" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Immutable Team Task Activity Timeline</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Complete audit history recording every status change, start, submission, admin approval, and override
            </p>
          </div>

          {auditLogs.length === 0 ? (
            <div className="card" style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
              <History size={36} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>No audit logs recorded yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="card"
                  style={{
                    padding: "14px 18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderLeft:
                      log.action === "APPROVED"
                        ? "3px solid var(--accent-green)"
                        : log.action === "SUBMITTED"
                        ? "3px solid var(--accent-amber)"
                        : log.action === "ADMIN_OVERRIDE"
                        ? "3px solid var(--brand-red)"
                        : "3px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{log.taskTitle || "Task"}</span>
                      <span
                        className="badge"
                        style={{
                          fontSize: 10,
                          background:
                            log.action === "APPROVED"
                              ? "rgba(34, 197, 94, 0.15)"
                              : log.action === "ADMIN_OVERRIDE"
                              ? "rgba(229, 62, 62, 0.15)"
                              : "rgba(255,255,255,0.08)",
                          color:
                            log.action === "APPROVED"
                              ? "var(--accent-green)"
                              : log.action === "ADMIN_OVERRIDE"
                              ? "var(--brand-red)"
                              : "var(--text-secondary)",
                        }}
                      >
                        {log.action}
                      </span>
                      {log.prevStatus && log.newStatus && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span>({log.prevStatus}</span>
                          <ArrowRight size={10} style={{ flexShrink: 0 }} />
                          <span>{log.newStatus})</span>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {log.description || log.comment}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{log.actorName}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {log.timestamp ? formatDateTime(log.timestamp) : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: REVIEW / APPROVE / OVERRIDE DECISION ── */}
      {reviewTask && reviewActionType && (
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
            setReviewTask(null);
            setReviewActionType(null);
          }}
        >
          <div
            className="card"
            style={{ width: 520, padding: 28, background: "var(--bg-primary)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                {reviewActionType === "approve"
                  ? "Approve Task & Mark Completed"
                  : reviewActionType === "changes_requested"
                  ? "Request Modifications"
                  : reviewActionType === "reject"
                  ? "Reject Task Submission"
                  : "Administrative Status Override"}
              </h3>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 8px" }}
                onClick={() => {
                  setReviewTask(null);
                  setReviewActionType(null);
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 16, fontSize: 13 }}>
              Task: <strong>{reviewTask.title}</strong>
              <br />
              Assignee: <strong>{reviewTask.assigneeName}</strong>
            </div>

            {/* Target status selector if override */}
            {reviewActionType === "override" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Select New Status:
                </label>
                <select
                  className="input-base"
                  value={overrideTargetStatus}
                  onChange={(e) => setOverrideTargetStatus(e.target.value as TaskStatus)}
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Completed">Completed (Approved)</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            )}

            {/* Comment / Reason */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                {reviewActionType === "override"
                  ? "Override Reason / Audit Justification *"
                  : reviewActionType === "changes_requested"
                  ? "What changes are required? *"
                  : reviewActionType === "reject"
                  ? "Rejection Reason *"
                  : "Approval Comments / Feedback (Optional):"}
              </label>
              <textarea
                className="input-base"
                rows={4}
                placeholder="Enter details for the audit trail…"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setReviewTask(null);
                  setReviewActionType(null);
                }}
                disabled={submittingReview}
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
                onClick={handleExecuteReview}
                disabled={submittingReview}
              >
                {submittingReview ? <Loader2 size={14} className="animate-spin" /> : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TASK ACTIVITY HISTORY TIMELINE ── */}
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
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Task Activity Timeline</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{timelineTask.title}</p>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setTimelineTask(null)}>
                <X size={16} />
              </button>
            </div>

            {/* Time Tracking Overview */}
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
                <span style={{ color: "var(--text-muted)" }}>Deadline:</span>{" "}
                <strong>{timelineTask.deadline ? formatDate(timelineTask.deadline) : "None"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Priority:</span>{" "}
                <strong>{timelineTask.priority}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Actual Start:</span>{" "}
                <strong>
                  {timelineTask.actualStartTime
                    ? formatDateTime(toDateObj(timelineTask.actualStartTime))
                    : "Not started"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Submitted:</span>{" "}
                <strong>
                  {timelineTask.submittedAt
                    ? formatDateTime(toDateObj(timelineTask.submittedAt))
                    : "Not submitted"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Approved:</span>{" "}
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

            {/* History Feed */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Audit Log Entries</div>
            {auditLogs.filter((l) => l.entityId === timelineTask.id).length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                No audit entries recorded for this task yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {auditLogs
                  .filter((l) => l.entityId === timelineTask.id)
                  .map((log) => (
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
            style={{ width: 480, padding: 28, background: "var(--bg-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Submit Work for Admin Review</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{submitTaskTarget.title}</p>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setSubmitTaskTarget(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Work Summary / Notes <span style={{ color: "var(--accent-red)" }}>*</span>
                </label>
                <textarea
                  className="input-base"
                  rows={4}
                  placeholder="Describe the deliverables, changes implemented, or testing completed…"
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  style={{ width: "100%", resize: "vertical", fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Proof / Deliverable URL (Optional)
                </label>
                <input
                  type="url"
                  className="input-base"
                  placeholder="https://github.com/... or PR / Figma / Document link"
                  value={submissionProofURL}
                  onChange={(e) => setSubmissionProofURL(e.target.value)}
                  style={{ width: "100%", fontSize: 13 }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, background: "var(--accent-amber)", color: "#000", fontWeight: 700 }}
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

      {/* ── MODAL: ASSIGN TASK WITH FULL TIME TRACKING ── */}
      {showAssignModal && (
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
          onClick={() => setShowAssignModal(false)}
        >
          <div
            className="card"
            style={{ width: 520, padding: 32, background: "var(--bg-primary)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>Assign Task & Set Schedule</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Specify start time, deadline, priority, and estimated hours
                </p>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setShowAssignModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAssignTask} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Task Title *
                </label>
                <input
                  required
                  className="input-base"
                  placeholder="e.g. Implement payment gateway integration"
                  value={assignForm.title}
                  onChange={(e) => setAssignForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Assign To Employee *
                </label>
                <select
                  required
                  className="input-base"
                  value={assignForm.assigneeId}
                  onChange={(e) => {
                    const emp = employees.find((em) => em.uid === e.target.value);
                    setAssignForm((p) => ({
                      ...p,
                      assigneeId: e.target.value,
                      assigneeName: emp?.name || "",
                    }));
                  }}
                >
                  <option value="">— Select Employee —</option>
                  {employees.map((em) => (
                    <option key={em.uid} value={em.uid}>
                      {em.name} ({em.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Description / Instructions
                </label>
                <textarea
                  className="input-base"
                  rows={3}
                  placeholder="Details, expectations, acceptance criteria…"
                  value={assignForm.desc}
                  onChange={(e) => setAssignForm((p) => ({ ...p, desc: e.target.value }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="input-base"
                    value={assignForm.startDate}
                    onChange={(e) => setAssignForm((p) => ({ ...p, startDate: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Deadline (Expected Completion) *
                  </label>
                  <input
                    required
                    type="date"
                    className="input-base"
                    value={assignForm.deadline}
                    onChange={(e) => setAssignForm((p) => ({ ...p, deadline: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Priority
                  </label>
                  <select
                    className="input-base"
                    value={assignForm.priority}
                    onChange={(e) => setAssignForm((p) => ({ ...p, priority: e.target.value as TaskPriority }))}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Estimated Effort (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="input-base"
                    value={assignForm.estimatedHours}
                    onChange={(e) => setAssignForm((p) => ({ ...p, estimatedHours: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: "var(--brand-red)" }}
                  disabled={savingTask}
                >
                  {savingTask ? <Loader2 size={14} className="animate-spin" /> : "Assign Task"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAssignModal(false)}
                  disabled={savingTask}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
