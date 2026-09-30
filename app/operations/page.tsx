"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  assigned_employee_id: string | null;
};

type Employee = {
  id: string;
  full_name: string;
};

type DispatchAssignment = {
  id: string;
  job_id: string;
  employee_id: string;
  assignment_status: string;
  acknowledged_at: string | null;
  started_at: string | null;
  escalated_at: string | null;
  closed_at: string | null;
};

type ActiveTimer = {
  id: string;
  employee_id: string;
  job_id: string | null;
  clock_in_time: string;
};

export default function OperationsControlCenterPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayInput());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dispatchAssignments, setDispatchAssignments] = useState<DispatchAssignment[]>([]);
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadOperations = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage("");

    const rangeStart = new Date(`${selectedDate}T00:00:00`).toISOString();
    const rangeEndDate = new Date(`${selectedDate}T00:00:00`);
    rangeEndDate.setDate(rangeEndDate.getDate() + 1);
    const rangeEnd = rangeEndDate.toISOString();

    const [jobsResponse, employeeResponse, dispatchResponse, timerResponse] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, job_title, job_status, priority, scheduled_start, assigned_employee_id")
        .gte("scheduled_start", rangeStart)
        .lt("scheduled_start", rangeEnd)
        .not("job_status", "eq", "cancelled")
        .order("scheduled_start", { ascending: true }),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("employment_status", "active")
        .order("full_name", { ascending: true }),
      supabase
        .from("dispatch_assignments")
        .select("id, job_id, employee_id, assignment_status, acknowledged_at, started_at, escalated_at, closed_at")
        .is("closed_at", null),
      supabase
        .from("employee_timeclock")
        .select("id, employee_id, job_id, clock_in_time")
        .eq("entry_type", "job")
        .is("clock_out_time", null),
    ]);

    const firstError = jobsResponse.error || employeeResponse.error || dispatchResponse.error || timerResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setJobs([]);
      setEmployees([]);
      setDispatchAssignments([]);
      setActiveTimers([]);
    } else {
      setJobs((jobsResponse.data ?? []) as Job[]);
      setEmployees((employeeResponse.data ?? []) as Employee[]);
      setDispatchAssignments((dispatchResponse.data ?? []) as DispatchAssignment[]);
      setActiveTimers((timerResponse.data ?? []) as ActiveTimer[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [selectedDate]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees],
  );

  const dispatchMap = useMemo(
    () => new Map(dispatchAssignments.map((assignment) => [assignment.job_id, assignment])),
    [dispatchAssignments],
  );

  const activeTimerJobIds = useMemo(
    () => new Set(activeTimers.map((timer) => timer.job_id).filter(Boolean)),
    [activeTimers],
  );

  const summary = useMemo(() => {
    const unassigned = jobs.filter((job) => !job.assigned_employee_id).length;
    const awaitingResponse = jobs.filter((job) => {
      const assignment = dispatchMap.get(job.id);
      return Boolean(job.assigned_employee_id) && (!assignment || assignment.assignment_status === "waiting");
    }).length;
    const escalated = jobs.filter((job) => dispatchMap.get(job.id)?.assignment_status === "escalated").length;
    const inProgress = jobs.filter(
      (job) => job.job_status === "in_progress" || activeTimerJobIds.has(job.id),
    ).length;
    const completionRequested = jobs.filter((job) => job.job_status === "completion_requested").length;
    const completed = jobs.filter((job) => job.job_status === "completed").length;
    return { total: jobs.length, unassigned, awaitingResponse, escalated, inProgress, completionRequested, completed };
  }, [activeTimerJobIds, dispatchMap, jobs]);

  const attentionJobs = useMemo(
    () => jobs.filter((job) => {
      const dispatch = dispatchMap.get(job.id);
      return !job.assigned_employee_id || dispatch?.assignment_status === "escalated" || job.job_status === "completion_requested";
    }),
    [dispatchMap, jobs],
  );

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">Operations Control Center</h1>
        <p className="font-bold text-gray-500">Loading daily operations…</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">Daily Operations</p>
          <h1 className="mt-1 text-3xl font-black text-gray-950">Operations Control Center</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            One view of the work-order flow from scheduling and dispatch through technician production, completion review, and billing.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-black text-gray-700">
            Date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1"
            />
          </label>
          <Link
            href="/operations/pilot-qa"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Pilot QA
          </Link>
          <button
            type="button"
            onClick={() => void loadOperations(true)}
            disabled={isRefreshing}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <Metric label="Scheduled" value={summary.total} href="/schedule" />
        <Metric label="Unassigned" value={summary.unassigned} href="/schedule" warning={summary.unassigned > 0} />
        <Metric label="Awaiting Response" value={summary.awaitingResponse} href="/dispatch" warning={summary.awaitingResponse > 0} />
        <Metric label="Escalated" value={summary.escalated} href="/dispatch" critical={summary.escalated > 0} />
        <Metric label="In Progress" value={summary.inProgress} href="/dispatch" />
        <Metric label="Completion Review" value={summary.completionRequested} href="/work-orders/completion-review" warning={summary.completionRequested > 0} />
        <Metric label="Completed" value={summary.completed} href="/work-orders" />
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Operational Flow</p>
            <h2 className="mt-1 text-xl font-black">Schedule → Dispatch → Technician → Review → Billing</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <FlowLink href="/schedule" label="1. Schedule" />
            <FlowLink href="/dispatch" label="2. Dispatch" />
            <FlowLink href="/work-orders" label="3. Work Orders" />
            <FlowLink href="/work-orders/completion-review" label="4. Completion Review" />
            <FlowLink href="/invoices" label="5. Billing" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border bg-white shadow-sm">
          <header className="border-b px-5 py-4">
            <h2 className="text-xl font-black">Needs Attention</h2>
            <p className="mt-1 text-sm font-bold text-gray-500">
              Unassigned work, escalated dispatches, and technician completion requests.
            </p>
          </header>

          <div className="divide-y">
            {attentionJobs.map((job) => {
              const dispatch = dispatchMap.get(job.id);
              const technician = job.assigned_employee_id ? employeeMap.get(job.assigned_employee_id) : null;
              const issue = !job.assigned_employee_id
                ? "Unassigned"
                : dispatch?.assignment_status === "escalated"
                  ? "Dispatch Escalated"
                  : job.job_status === "completion_requested"
                    ? "Completion Review"
                    : "Attention";

              return (
                <div key={job.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">{issue}</span>
                      {job.priority && job.priority !== "normal" && (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase text-red-800">{formatText(job.priority)}</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-black text-gray-950">{job.job_title}</h3>
                    <p className="mt-1 text-sm font-bold text-gray-500">
                      {formatTime(job.scheduled_start)} · {technician ?? "No technician assigned"}
                    </p>
                  </div>
                  <Link href={`/work-orders/${job.id}`} className="rounded-xl bg-gray-950 px-4 py-2 text-center text-sm font-black text-white">
                    Open Work Order
                  </Link>
                </div>
              );
            })}

            {attentionJobs.length === 0 && (
              <div className="p-10 text-center">
                <h3 className="text-lg font-black text-green-800">No immediate workflow exceptions</h3>
                <p className="mt-2 text-sm font-bold text-gray-500">Today&apos;s scheduled work has no unassigned, escalated, or completion-review exceptions.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Quick Actions</h2>
          <div className="mt-4 grid gap-3">
            <ActionLink href="/work-orders/new" title="Create Work Order" detail="Add new customer work." />
            <ActionLink href="/schedule" title="Assign & Schedule" detail="Place work on technician calendars." />
            <ActionLink href="/dispatch" title="Run Dispatch" detail="Manage acknowledgment and production." />
            <ActionLink href="/work-orders/completion-review" title="Review Completion" detail="Approve technician submissions." />
            <ActionLink href="/invoices" title="Release to Billing" detail="Invoice approved completed work." />
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value, href, warning = false, critical = false }: { label: string; value: number; href: string; warning?: boolean; critical?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 ${
        critical ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : "bg-white"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${critical ? "text-red-800" : warning ? "text-amber-800" : "text-gray-950"}`}>{value}</p>
    </Link>
  );
}

function FlowLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-black text-gray-800 hover:bg-gray-100">{label}</Link>;
}

function ActionLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="rounded-xl border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50">
      <p className="font-black text-gray-950">{title}</p>
      <p className="mt-1 text-sm font-bold text-gray-500">{detail}</p>
    </Link>
  );
}

function getTodayInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatText(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
