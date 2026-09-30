"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type TimeEntry = {
  id: string;
  employee_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
  approved_at: string | null;
};

type Employee = {
  id: string;
  full_name: string;
};

type PayrollPeriod = {
  id: string;
  week_start: string;
  week_end: string;
  status: "draft" | "finalized";
  finalized_at: string | null;
};

type JobSummary = {
  id: string;
  job_status: string | null;
  scheduled_start: string | null;
};

type DashboardTotals = {
  openShiftCount: number;
  activeJobTimerCount: number;
  unapprovedHours: number;
  payrollHours: number;
};

export default function AdminDashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(
    null,
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [recurringJobIds, setRecurringJobIds] = useState<
    Set<string>
  >(new Set());
  const [payrollPeriod, setPayrollPeriod] =
    useState<PayrollPeriod | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const weekStart = useMemo(
    () => getCurrentSundayInput(),
    [],
  );

  const weekEnd = useMemo(
    () => addDaysToDateInput(weekStart, 6),
    [weekStart],
  );

  const loadDashboard = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("id", session.user.id)
          .maybeSingle();

      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (!profileData) {
        setErrorMessage(
          "No profile is connected to this login.",
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const currentProfile = profileData as Profile;
      const role =
        currentProfile.role?.toLowerCase() ?? "";

      if (!["admin", "manager"].includes(role)) {
        setProfile(currentProfile);
        setErrorMessage(
          "Access denied. Only administrators and managers can view this dashboard.",
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setProfile(currentProfile);

      const rangeStart = localDateStartToIso(weekStart);
      const rangeEnd = localDateStartToIso(
        addDaysToDateInput(weekEnd, 1),
      );

      const [
        employeesResponse,
        entriesResponse,
        jobsResponse,
        recurringResponse,
        periodResponse,
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name")
          .order("full_name", { ascending: true }),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            employee_id,
            entry_type,
            activity_type,
            clock_in_time,
            clock_out_time,
            approved_at
          `)
          .gte("clock_in_time", rangeStart)
          .lt("clock_in_time", rangeEnd)
          .order("clock_in_time", { ascending: false }),

        supabase
          .from("jobs")
          .select("id, job_status, scheduled_start"),

        supabase
          .from("recurring_service_occurrences")
          .select("job_id")
          .not("job_id", "is", null),

        supabase
          .from("payroll_periods")
          .select(`
            id,
            week_start,
            week_end,
            status,
            finalized_at
          `)
          .eq("week_start", weekStart)
          .maybeSingle(),
      ]);

      const firstError =
        employeesResponse.error ||
        entriesResponse.error ||
        jobsResponse.error ||
        recurringResponse.error ||
        periodResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setEmployees(
        (employeesResponse.data ?? []) as Employee[],
      );

      setEntries(
        (entriesResponse.data ?? []) as TimeEntry[],
      );

      setJobs(
        (jobsResponse.data ?? []) as JobSummary[],
      );

      setRecurringJobIds(
        new Set(
          (recurringResponse.data ?? [])
            .map((row) => row.job_id as string | null)
            .filter(
              (jobId): jobId is string =>
                Boolean(jobId),
            ),
        ),
      );

      setPayrollPeriod(
        (periodResponse.data as PayrollPeriod | null) ??
          null,
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [router, weekEnd, weekStart],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totals = useMemo<DashboardTotals>(() => {
    let openShiftCount = 0;
    let activeJobTimerCount = 0;
    let unapprovedHours = 0;
    let payrollHours = 0;

    for (const entry of entries) {
      if (!entry.clock_out_time) {
        if (entry.entry_type === "shift") {
          openShiftCount += 1;
        } else {
          activeJobTimerCount += 1;
        }

        continue;
      }

      if (entry.entry_type !== "shift") {
        continue;
      }

      const hours = calculateHours(entry);
      payrollHours += hours;

      if (!entry.approved_at) {
        unapprovedHours += hours;
      }
    }

    return {
      openShiftCount,
      activeJobTimerCount,
      unapprovedHours,
      payrollHours,
    };
  }, [entries]);

  const workOrderTotals = useMemo(() => {
    let scheduled = 0;
    let inProgress = 0;
    let waiting = 0;
    let completed = 0;
    let overdue = 0;
    let recurring = 0;

    for (const job of jobs) {
      const category = getJobStatusCategory(job);

      if (category === "scheduled") {
        scheduled += 1;
      } else if (category === "in_progress") {
        inProgress += 1;
      } else if (category === "waiting") {
        waiting += 1;
      } else if (category === "completed") {
        completed += 1;
      }

      if (isJobOverdue(job)) {
        overdue += 1;
      }

      if (recurringJobIds.has(job.id)) {
        recurring += 1;
      }
    }

    return {
      total: jobs.length,
      scheduled,
      inProgress,
      waiting,
      completed,
      overdue,
      recurring,
    };
  }, [jobs, recurringJobIds]);

  const openShifts = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.entry_type === "shift" &&
          !entry.clock_out_time,
      ),
    [entries],
  );

  const activeJobTimers = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.entry_type === "job" &&
          !entry.clock_out_time,
      ),
    [entries],
  );

  const employeeNames = useMemo(() => {
    return new Map(
      employees.map((employee) => [
        employee.id,
        employee.full_name,
      ]),
    );
  }, [employees]);

  const isReadyToFinalize =
    totals.openShiftCount === 0 &&
    totals.unapprovedHours === 0 &&
    payrollPeriod?.status !== "finalized";

  const hasAccess =
    profile &&
    ["admin", "manager"].includes(
      profile.role?.toLowerCase() ?? "",
    );

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Admin Dashboard
        </h1>

        <p className="text-gray-600">
          Loading operations summary…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Operations
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Admin Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            Current payroll status, active employee shifts,
            and job-production timers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard(true)}
          disabled={isRefreshing}
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {hasAccess && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Employees Clocked In"
              value={String(totals.openShiftCount)}
              note="Open daily payroll shifts"
              warning={totals.openShiftCount > 0}
            />

            <SummaryCard
              title="Active Job Timers"
              value={String(totals.activeJobTimerCount)}
              note="Travel, onsite, or work timers"
              warning={totals.activeJobTimerCount > 0}
            />

            <SummaryCard
              title="Unapproved Hours"
              value={formatHours(totals.unapprovedHours)}
              note="Closed shifts awaiting approval"
              warning={totals.unapprovedHours > 0}
            />

            <SummaryCard
              title="Payroll Hours"
              value={formatHours(totals.payrollHours)}
              note={`${formatDate(
                weekStart,
              )} through ${formatDate(weekEnd)}`}
            />
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Work Order Operations
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Current Work Order Status
                </h2>
              </div>

              <Link
                href="/work-orders"
                className="rounded-xl bg-gray-950 px-5 py-3 text-center text-sm font-black text-white hover:opacity-90"
              >
                Open Work Orders
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <SummaryCard
                title="Scheduled"
                value={String(workOrderTotals.scheduled)}
                note="Open and scheduled work"
              />

              <SummaryCard
                title="In Progress"
                value={String(workOrderTotals.inProgress)}
                note="Work currently underway"
                warning={workOrderTotals.inProgress > 0}
              />

              <SummaryCard
                title="Waiting"
                value={String(workOrderTotals.waiting)}
                note="Parts, vendor, or client hold"
                warning={workOrderTotals.waiting > 0}
              />

              <SummaryCard
                title="Completed"
                value={String(workOrderTotals.completed)}
                note="Completed or closed"
              />

              <SummaryCard
                title="Overdue"
                value={String(workOrderTotals.overdue)}
                note="Past scheduled time"
                warning={workOrderTotals.overdue > 0}
              />

              <SummaryCard
                title="Recurring"
                value={String(workOrderTotals.recurring)}
                note="Generated from recurring services"
              />
            </div>
          </section>

          <section
            className={`rounded-2xl border p-5 shadow-sm ${
              payrollPeriod?.status === "finalized"
                ? "border-green-200 bg-green-50"
                : isReadyToFinalize
                  ? "border-blue-200 bg-blue-50"
                  : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Current Payroll Period
                </p>

                <h2 className="mt-1 text-xl font-black">
                  {payrollPeriod?.status === "finalized"
                    ? "Finalized"
                    : isReadyToFinalize
                      ? "Ready to Finalize"
                      : "Action Required"}
                </h2>

                <p className="mt-2 text-sm font-bold text-gray-700">
                  {formatDate(weekStart)} through{" "}
                  {formatDate(weekEnd)}
                </p>

                {payrollPeriod?.status === "finalized" ? (
                  <p className="mt-2 text-sm text-green-800">
                    This payroll period is finalized and ready
                    for payroll processing.
                  </p>
                ) : isReadyToFinalize ? (
                  <p className="mt-2 text-sm text-blue-800">
                    All shifts are closed and approved. The
                    period can now be finalized.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-amber-900">
                    Close all employee shifts and approve all
                    completed payroll time before finalizing.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/timeclock"
                  className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50"
                >
                  Manage Timeclock
                </Link>

                <Link
                  href="/timeclock/payroll"
                  className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90"
                >
                  Open Payroll Summary
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <DashboardList
              title="Employees Currently Clocked In"
              emptyMessage="No employees are currently clocked in."
              entries={openShifts}
              employeeNames={employeeNames}
            />

            <DashboardList
              title="Active Job Production Timers"
              emptyMessage="No job-production timers are active."
              entries={activeJobTimers}
              employeeNames={employeeNames}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink
              href="/clients"
              title="Clients"
              note="Manage client records"
            />

            <QuickLink
              href="/work-orders"
              title="Work Orders"
              note="Review work orders"
            />

            <QuickLink
              href="/schedule"
              title="Schedule"
              note="Manage technician assignments"
            />

            <QuickLink
              href="/recurring"
              title="Recurring Services"
              note="Manage repeating work"
            />
          </section>
        </>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  value,
  note,
  warning = false,
}: {
  title: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm ${
        warning
          ? "border-amber-200 bg-amber-50"
          : "bg-white"
      }`}
    >
      <p className="text-sm font-black text-gray-500">
        {title}
      </p>

      <p className="mt-2 text-3xl font-black text-gray-950">
        {value}
      </p>

      <p className="mt-2 text-xs font-bold text-gray-500">
        {note}
      </p>
    </section>
  );
}

function DashboardList({
  title,
  emptyMessage,
  entries,
  employeeNames,
}: {
  title: string;
  emptyMessage: string;
  entries: TimeEntry[];
  employeeNames: Map<string, string>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <header className="border-b px-5 py-4">
        <h2 className="text-lg font-black">{title}</h2>
      </header>

      {entries.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">
          {emptyMessage}
        </p>
      ) : (
        <div className="divide-y">
          {entries.map((entry) => (
            <article key={entry.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black text-gray-950">
                    {entry.employee_id
                      ? employeeNames.get(entry.employee_id) ??
                        "Unknown employee"
                      : "Unknown employee"}
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    Started{" "}
                    {new Date(
                      entry.clock_in_time,
                    ).toLocaleString()}
                  </p>
                </div>

                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase text-green-800">
                  {entry.entry_type === "shift"
                    ? "On the Clock"
                    : formatActivity(entry.activity_type)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickLink({
  href,
  title,
  note,
}: {
  href: string;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-bakerssPink"
    >
      <p className="font-black text-gray-950">
        {title}
      </p>

      <p className="mt-1 text-sm text-gray-500">
        {note}
      </p>
    </Link>
  );
}

function normalizeJobStatus(value: string | null) {
  return (value ?? "new")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function getJobStatusCategory(
  job: JobSummary,
):
  | "scheduled"
  | "in_progress"
  | "waiting"
  | "completed"
  | "other" {
  const status = normalizeJobStatus(job.job_status);

  if (
    [
      "completed",
      "complete",
      "closed",
      "invoiced",
      "cancelled",
      "canceled",
    ].includes(status)
  ) {
    return "completed";
  }

  if (
    [
      "in_progress",
      "inprogress",
      "onsite",
      "work_started",
      "started",
    ].includes(status)
  ) {
    return "in_progress";
  }

  if (
    [
      "waiting",
      "on_hold",
      "pending",
      "pending_vendor",
      "pending_vendor_quote",
      "vendor_quote_rejected",
      "waiting_on_parts",
      "waiting_on_client",
      "waiting_on_vendor",
    ].includes(status)
  ) {
    return "waiting";
  }

  if (
    [
      "scheduled",
      "assigned",
      "new",
      "open",
      "approved",
    ].includes(status) ||
    job.scheduled_start
  ) {
    return "scheduled";
  }

  return "other";
}

function isJobOverdue(job: JobSummary) {
  if (!job.scheduled_start) {
    return false;
  }

  if (getJobStatusCategory(job) === "completed") {
    return false;
  }

  const scheduledTime = new Date(
    job.scheduled_start,
  ).getTime();

  return (
    !Number.isNaN(scheduledTime) &&
    scheduledTime < Date.now()
  );
}

function calculateHours(entry: TimeEntry) {
  if (!entry.clock_out_time) {
    return 0;
  }

  const start = new Date(entry.clock_in_time).getTime();
  const end = new Date(entry.clock_out_time).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end < start
  ) {
    return 0;
  }

  return (end - start) / 3_600_000;
}

function getCurrentSundayInput() {
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  date.setDate(date.getDate() - date.getDay());

  return formatDateInput(date);
}

function addDaysToDateInput(
  value: string,
  days: number,
) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);

  return formatDateInput(date);
}

function localDateStartToIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0",
  );
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} hrs`;
}

function formatActivity(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}