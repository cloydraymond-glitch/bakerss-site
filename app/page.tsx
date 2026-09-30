"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import KpiCard from "../components/KpiCard";
import { supabase } from "../lib/supabase/client";

type DashboardJob = {
  id: string;
  job_title: string;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  assigned_employee_id: string | null;

  clients: {
    client_name: string;
  } | null;

  properties: {
    property_name: string | null;
    street_address: string | null;
  } | null;

  services: {
    service_name: string;
  } | null;

  employees: {
    full_name: string;
  } | null;
};

type OpenTimeEntry = {
  id: string;
  employee_id: string | null;
  job_id: string | null;
  clock_in_time: string;

  employees: {
    full_name: string;
  } | null;

  jobs: {
    job_title: string;
  } | null;
};

type ActivityEntry = {
  id: string;
  action: string | null;
  activity_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: {
    message?: string;
    note?: string;
  } | null;
  created_at: string;
};


type DashboardInvoice = {
  id: string;
  invoice_number: string | null;
  invoice_status: "draft" | "sent" | "paid" | "overdue" | "void";
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;

  clients: {
    client_name: string;
  } | null;
};

type InvoicedJobLink = {
  job_id: string | null;
};

export default function Dashboard() {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [openTimeEntries, setOpenTimeEntries] = useState<OpenTimeEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([]);
  const [invoicedJobLinks, setInvoicedJobLinks] = useState<InvoicedJobLink[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setErrorMessage("");

    const [
      jobsResponse,
      timeclockResponse,
      activityResponse,
      invoicesResponse,
      invoicedJobsResponse,
    ] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            job_title,
            job_status,
            priority,
            scheduled_start,
            estimated_price,
            assigned_employee_id,
            clients (
              client_name
            ),
            properties (
              property_name,
              street_address
            ),
            services (
              service_name
            ),
            employees (
              full_name
            )
          `)
          .order("scheduled_start", {
            ascending: true,
            nullsFirst: false,
          }),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            employee_id,
            job_id,
            clock_in_time,
            employees (
              full_name
            ),
            jobs (
              job_title
            )
          `)
          .eq("status", "open")
          .is("clock_out_time", null)
          .order("clock_in_time", { ascending: true }),

        supabase
          .from("activity_log")
          .select(`
            id,
            action,
            activity_type,
            entity_type,
            entity_id,
            metadata,
            created_at
          `)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("invoices")
          .select(`
            id,
            invoice_number,
            invoice_status,
            issue_date,
            due_date,
            total_amount,
            amount_paid,
            balance_due,
            clients (
              client_name
            )
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("invoice_line_items")
          .select("job_id")
          .not("job_id", "is", null),
      ]);

    const firstError =
      jobsResponse.error ||
      timeclockResponse.error ||
      activityResponse.error ||
      invoicesResponse.error ||
      invoicedJobsResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    setJobs((jobsResponse.data ?? []) as unknown as DashboardJob[]);
    setOpenTimeEntries(
      (timeclockResponse.data ?? []) as unknown as OpenTimeEntry[],
    );
    setActivity((activityResponse.data ?? []) as ActivityEntry[]);
    setInvoices(
      (invoicesResponse.data ?? []) as unknown as DashboardInvoice[],
    );
    setInvoicedJobLinks(
      (invoicedJobsResponse.data ?? []) as InvoicedJobLink[],
    );

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const dashboardData = useMemo(() => {
    const now = new Date();

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const weekStart = new Date(todayStart);
    const day = weekStart.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - daysSinceMonday);

    const activeJobs = jobs.filter(
      (job) =>
        job.job_status !== "completed" &&
        job.job_status !== "cancelled",
    );

    const scheduledToday = jobs.filter((job) => {
      if (!job.scheduled_start) {
        return false;
      }

      const scheduledDate = new Date(job.scheduled_start);

      return (
        !Number.isNaN(scheduledDate.getTime()) &&
        scheduledDate >= todayStart &&
        scheduledDate < tomorrowStart
      );
    });

    const completedThisWeek = jobs.filter((job) => {
      if (
        job.job_status !== "completed" ||
        !job.scheduled_start
      ) {
        return false;
      }

      const scheduledDate = new Date(job.scheduled_start);

      return (
        !Number.isNaN(scheduledDate.getTime()) &&
        scheduledDate >= weekStart &&
        scheduledDate < tomorrowStart
      );
    });

    const activeInvoices = invoices.filter(
      (invoice) => invoice.invoice_status !== "void",
    );

    const outstandingBalance = activeInvoices
      .filter((invoice) =>
        ["sent", "overdue"].includes(invoice.invoice_status),
      )
      .reduce(
        (sum, invoice) => sum + Number(invoice.balance_due || 0),
        0,
      );

    const overdueBalance = activeInvoices
      .filter((invoice) => invoice.invoice_status === "overdue")
      .reduce(
        (sum, invoice) => sum + Number(invoice.balance_due || 0),
        0,
      );

    const paidRevenue = activeInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount_paid || 0),
      0,
    );

    const draftInvoices = activeInvoices.filter(
      (invoice) => invoice.invoice_status === "draft",
    );

    const invoicedJobIds = new Set(
      invoicedJobLinks
        .map((link) => link.job_id)
        .filter((jobId): jobId is string => Boolean(jobId)),
    );

    const completedUnbilledJobs = jobs.filter(
      (job) =>
        job.job_status === "completed" &&
        !invoicedJobIds.has(job.id),
    );

    const completedUnbilledValue = completedUnbilledJobs.reduce(
      (sum, job) => sum + Number(job.estimated_price || 0),
      0,
    );

    const priorityJobs = activeJobs
      .filter(
        (job) =>
          job.priority === "urgent" ||
          job.priority === "high" ||
          isOverdue(job.scheduled_start),
      )
      .sort((first, second) => {
        const priorityOrder: Record<string, number> = {
          urgent: 0,
          high: 1,
          normal: 2,
          low: 3,
        };

        const firstPriority =
          priorityOrder[first.priority || "normal"] ?? 2;
        const secondPriority =
          priorityOrder[second.priority || "normal"] ?? 2;

        if (firstPriority !== secondPriority) {
          return firstPriority - secondPriority;
        }

        const firstDate = first.scheduled_start
          ? new Date(first.scheduled_start).getTime()
          : Number.MAX_SAFE_INTEGER;

        const secondDate = second.scheduled_start
          ? new Date(second.scheduled_start).getTime()
          : Number.MAX_SAFE_INTEGER;

        return firstDate - secondDate;
      })
      .slice(0, 6);

    const crewSchedule = scheduledToday
      .sort((first, second) => {
        const firstDate = first.scheduled_start
          ? new Date(first.scheduled_start).getTime()
          : Number.MAX_SAFE_INTEGER;

        const secondDate = second.scheduled_start
          ? new Date(second.scheduled_start).getTime()
          : Number.MAX_SAFE_INTEGER;

        return firstDate - secondDate;
      })
      .slice(0, 8);

    return {
      openWorkOrders: activeJobs.length,
      scheduledToday,
      completedThisWeek,
      outstandingBalance,
      overdueBalance,
      paidRevenue,
      draftInvoices,
      completedUnbilledJobs,
      completedUnbilledValue,
      priorityJobs,
      crewSchedule,
    };
  }, [invoicedJobLinks, invoices, jobs]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black">Dashboard</h1>
          <p className="mt-1 text-gray-600">
            Daily command center for Bakerss operations.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => void loadDashboard(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>

          <div className="rounded-full bg-black px-5 py-2 text-center text-sm font-bold text-white">
            Owner View
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Open Work Orders"
          value={String(dashboardData.openWorkOrders)}
          note="Active jobs not completed or cancelled"
        />

        <KpiCard
          title="Scheduled Today"
          value={String(dashboardData.scheduledToday.length)}
          note="Jobs scheduled for today"
        />

        <KpiCard
          title="Completed This Week"
          value={String(dashboardData.completedThisWeek.length)}
          note="Completed jobs scheduled since Monday"
        />

        <KpiCard
          title="Completed Not Invoiced"
          value={formatCurrency(dashboardData.completedUnbilledValue)}
          note={`${dashboardData.completedUnbilledJobs.length} completed work order(s)`}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Outstanding Invoices"
          value={formatCurrency(dashboardData.outstandingBalance)}
          note="Sent and overdue invoice balances"
        />

        <KpiCard
          title="Overdue Balance"
          value={formatCurrency(dashboardData.overdueBalance)}
          note="Invoices currently marked overdue"
        />

        <KpiCard
          title="Paid Revenue"
          value={formatCurrency(dashboardData.paidRevenue)}
          note="Payments recorded in Bakerss OS"
        />

        <KpiCard
          title="Drafts Ready to Send"
          value={String(dashboardData.draftInvoices.length)}
          note="Draft invoices awaiting review"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/invoices"
          className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
        >
          Open Invoices
        </Link>

        <Link
          href="/invoices/new"
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50"
        >
          Create Invoice
        </Link>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">
                Priority Work Orders
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Urgent, high-priority, and overdue active work.
              </p>
            </div>

            <Link
              href="/work-orders"
              className="text-sm font-black text-bakerssPink"
            >
              View All
            </Link>
          </div>

          {dashboardData.priorityJobs.length === 0 ? (
            <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No urgent, high-priority, or overdue work orders.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {dashboardData.priorityJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/work-orders/${job.id}`}
                  className="block rounded-xl border p-4 transition hover:bg-gray-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black text-gray-950">
                      {job.job_title}
                    </h3>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getPriorityClasses(
                        job.priority,
                      )}`}
                    >
                      {job.priority || "normal"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-600">
                    {job.clients?.client_name || "No customer"}
                    {" · "}
                    {job.properties?.property_name ||
                      job.properties?.street_address ||
                      "No property"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-gray-500">
                    <span>
                      {formatStatus(job.job_status)}
                    </span>
                    <span>
                      {job.employees?.full_name || "Unassigned"}
                    </span>
                    <span>
                      {formatDateTime(job.scheduled_start)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">
                Today&apos;s Crew Schedule
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Work orders scheduled for today.
              </p>
            </div>
          </div>

          {dashboardData.crewSchedule.length === 0 ? (
            <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No work orders are scheduled for today.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {dashboardData.crewSchedule.map((job) => (
                <Link
                  key={job.id}
                  href={`/work-orders/${job.id}`}
                  className="flex items-start justify-between gap-4 rounded-xl border p-4 transition hover:bg-gray-50"
                >
                  <div>
                    <p className="font-black text-gray-950">
                      {job.job_title}
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      {job.employees?.full_name || "Unassigned"}
                    </p>

                    <p className="mt-1 text-xs font-bold text-gray-500">
                      {job.services?.service_name || "General Service"}
                    </p>
                  </div>

                  <span className="shrink-0 text-sm font-black text-bakerssPink">
                    {formatTime(job.scheduled_start)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">
                Currently Clocked In
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Open employee timeclock entries.
              </p>
            </div>

            <Link
              href="/timeclock"
              className="text-sm font-black text-bakerssPink"
            >
              Timeclock
            </Link>
          </div>

          {openTimeEntries.length === 0 ? (
            <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No employees are currently clocked in.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {openTimeEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-gray-950">
                      {entry.employees?.full_name ||
                        "Unknown employee"}
                    </p>

                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                      Clocked In
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-600">
                    {entry.jobs?.job_title || "General shift"}
                  </p>

                  <p className="mt-2 text-xs font-bold text-gray-500">
                    Since {formatDateTime(entry.clock_in_time)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">
                Recent Activity
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Latest operational changes and field updates.
              </p>
            </div>
          </div>

          {activity.length === 0 ? (
            <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No activity has been recorded.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {activity.map((entry) => {
                const message =
                  entry.metadata?.message ||
                  entry.metadata?.note ||
                  formatStatus(entry.action);

                const content = (
                  <div className="rounded-xl border p-4 transition hover:bg-gray-50">
                    <p className="text-sm font-bold text-gray-800">
                      {message || "Activity recorded"}
                    </p>

                    <p className="mt-2 text-xs font-bold text-gray-500">
                      {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                );

                if (
                  entry.entity_type === "job" &&
                  entry.entity_id
                ) {
                  return (
                    <Link
                      key={entry.id}
                      href={`/work-orders/${entry.entity_id}`}
                      className="block"
                    >
                      {content}
                    </Link>
                  );
                }

                if (
                  entry.entity_type === "invoice" &&
                  entry.entity_id
                ) {
                  return (
                    <Link
                      key={entry.id}
                      href={`/invoices/${entry.entity_id}`}
                      className="block"
                    >
                      {content}
                    </Link>
                  );
                }

                return <div key={entry.id}>{content}</div>;
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function isOverdue(value: string | null) {
  if (!value) {
    return false;
  }

  const scheduledDate = new Date(value);

  if (Number.isNaN(scheduledDate.getTime())) {
    return false;
  }

  return scheduledDate.getTime() < Date.now();
}

function formatStatus(value: string | null) {
  if (!value) {
    return "New";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string | null) {
  if (!value) {
    return "Unscheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function getPriorityClasses(priority: string | null) {
  switch (priority) {
    case "urgent":
      return "bg-red-50 text-red-700";
    case "high":
      return "bg-pink-50 text-bakerssPink";
    case "low":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}