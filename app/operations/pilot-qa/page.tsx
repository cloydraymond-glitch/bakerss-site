"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase/client";

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  assigned_employee_id: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  materials_cost: number | null;
};

type DispatchAssignment = {
  id: string;
  job_id: string;
  assignment_status: string | null;
  acknowledged_at: string | null;
  started_at: string | null;
  closed_at: string | null;
};

type TimeEntry = {
  id: string;
  job_id: string | null;
  clock_in_time: string;
  clock_out_time: string | null;
};

type JobPhoto = {
  id: string;
  job_id: string;
  photo_type: string | null;
};

type ActivityEntry = {
  id: string;
  entity_id: string | null;
  action: string;
};

type InvoiceLink = {
  invoice_id: string;
  job_id: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  invoice_status: string | null;
  amount_paid: number | null;
  subtotal: number | null;
  tax_amount: number | null;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
};

type QaIssue = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

export default function PilotQaPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dispatchAssignments, setDispatchAssignments] = useState<DispatchAssignment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [invoiceLinks, setInvoiceLinks] = useState<InvoiceLink[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadQa = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage("");

    const [
      jobsResponse,
      dispatchResponse,
      timeResponse,
      photosResponse,
      activityResponse,
      invoiceLinksResponse,
      invoicesResponse,
      paymentsResponse,
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, job_title, job_status, assigned_employee_id, scheduled_start, estimated_price, materials_cost")
        .order("scheduled_start", { ascending: false, nullsFirst: false })
        .limit(250),
      supabase
        .from("dispatch_assignments")
        .select("id, job_id, assignment_status, acknowledged_at, started_at, closed_at")
        .order("id", { ascending: false })
        .limit(500),
      supabase
        .from("employee_timeclock")
        .select("id, job_id, clock_in_time, clock_out_time")
        .eq("entry_type", "job")
        .order("clock_in_time", { ascending: false })
        .limit(1000),
      supabase
        .from("job_photos")
        .select("id, job_id, photo_type")
        .order("id", { ascending: false })
        .limit(1000),
      supabase
        .from("activity_log")
        .select("id, entity_id, action")
        .eq("entity_type", "job")
        .eq("action", "technician_completion_requested")
        .order("id", { ascending: false })
        .limit(500),
      supabase
        .from("invoice_line_items")
        .select("invoice_id, job_id")
        .not("job_id", "is", null)
        .limit(1000),
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_status, amount_paid, subtotal, tax_amount")
        .order("issue_date", { ascending: false })
        .limit(500),
      supabase
        .from("invoice_payments")
        .select("id, invoice_id, amount")
        .order("payment_date", { ascending: false })
        .limit(1000),
    ]);

    const responses = [
      jobsResponse,
      dispatchResponse,
      timeResponse,
      photosResponse,
      activityResponse,
      invoiceLinksResponse,
      invoicesResponse,
      paymentsResponse,
    ];
    const firstError = responses.find((response) => response.error)?.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setJobs([]);
      setDispatchAssignments([]);
      setTimeEntries([]);
      setPhotos([]);
      setActivities([]);
      setInvoiceLinks([]);
      setInvoices([]);
      setPayments([]);
    } else {
      setJobs((jobsResponse.data ?? []) as Job[]);
      setDispatchAssignments((dispatchResponse.data ?? []) as DispatchAssignment[]);
      setTimeEntries((timeResponse.data ?? []) as TimeEntry[]);
      setPhotos((photosResponse.data ?? []) as JobPhoto[]);
      setActivities((activityResponse.data ?? []) as ActivityEntry[]);
      setInvoiceLinks((invoiceLinksResponse.data ?? []) as InvoiceLink[]);
      setInvoices((invoicesResponse.data ?? []) as Invoice[]);
      setPayments((paymentsResponse.data ?? []) as Payment[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadQa();
  }, [loadQa]);

  const qa = useMemo(() => {
    const dispatchByJob = new Map<string, DispatchAssignment[]>();
    for (const assignment of dispatchAssignments) {
      const current = dispatchByJob.get(assignment.job_id) ?? [];
      current.push(assignment);
      dispatchByJob.set(assignment.job_id, current);
    }

    const timeByJob = new Map<string, TimeEntry[]>();
    for (const entry of timeEntries) {
      if (!entry.job_id) continue;
      const current = timeByJob.get(entry.job_id) ?? [];
      current.push(entry);
      timeByJob.set(entry.job_id, current);
    }

    const completionPhotoJobs = new Set(
      photos.filter((photo) => photo.photo_type === "completion").map((photo) => photo.job_id),
    );
    const completionActivityJobs = new Set(
      activities.map((activity) => activity.entity_id).filter((id): id is string => Boolean(id)),
    );
    const invoicedJobs = new Set(
      invoiceLinks.map((link) => link.job_id).filter((id): id is string => Boolean(id)),
    );
    const paymentsByInvoice = new Map<string, number>();
    for (const payment of payments) {
      paymentsByInvoice.set(
        payment.invoice_id,
        (paymentsByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount ?? 0),
      );
    }

    const issues: QaIssue[] = [];

    for (const job of jobs) {
      const assignments = dispatchByJob.get(job.id) ?? [];
      const openAssignments = assignments.filter((assignment) => !assignment.closed_at);
      const jobTimes = timeByJob.get(job.id) ?? [];
      const closedTimes = jobTimes.filter((entry) => Boolean(entry.clock_out_time));
      const hasOpenTimer = jobTimes.some((entry) => !entry.clock_out_time);

      if (
        job.assigned_employee_id &&
        job.scheduled_start &&
        !["completed", "cancelled"].includes(job.job_status ?? "") &&
        openAssignments.length === 0
      ) {
        issues.push({
          id: `dispatch-${job.id}`,
          severity: "warning",
          title: "Assigned work has no open dispatch assignment",
          detail: job.job_title,
          href: `/work-orders/${job.id}`,
        });
      }

      if (job.job_status === "in_progress" && closedTimes.length === 0 && !hasOpenTimer) {
        issues.push({
          id: `time-${job.id}`,
          severity: "warning",
          title: "In-progress work has no job-time record",
          detail: job.job_title,
          href: `/work-orders/${job.id}`,
        });
      }

      if (job.job_status === "completion_requested") {
        const missing: string[] = [];
        if (!completionActivityJobs.has(job.id)) missing.push("completion request log");
        if (!completionPhotoJobs.has(job.id)) missing.push("completion photo");
        if (closedTimes.length === 0) missing.push("closed job timer");
        if (hasOpenTimer) missing.push("clock-out");
        if (!(Number(job.estimated_price ?? 0) > 0)) missing.push("billable price");
        if (job.materials_cost === null) missing.push("materials cost");

        if (missing.length > 0) {
          issues.push({
            id: `completion-${job.id}`,
            severity: "critical",
            title: "Completion request is blocked",
            detail: `${job.job_title}: missing ${missing.join(", ")}`,
            href: `/work-orders/${job.id}`,
          });
        }
      }

      if (job.job_status === "completed" && !invoicedJobs.has(job.id)) {
        issues.push({
          id: `billing-${job.id}`,
          severity: "warning",
          title: "Completed work has not been invoiced",
          detail: job.job_title,
          href: `/invoices/new?jobId=${job.id}`,
        });
      }
    }

    for (const invoice of invoices) {
      const total = Number(invoice.subtotal ?? 0) + Number(invoice.tax_amount ?? 0);
      const recordedAmount = Number(invoice.amount_paid ?? 0);
      const paymentTotal = paymentsByInvoice.get(invoice.id) ?? 0;

      if (recordedAmount > total + 0.01) {
        issues.push({
          id: `overpaid-${invoice.id}`,
          severity: "critical",
          title: "Invoice amount paid exceeds invoice total",
          detail: invoice.invoice_number ?? invoice.id,
          href: `/invoices/${invoice.id}`,
        });
      }

      if (invoice.invoice_status === "paid" && recordedAmount > 0 && paymentTotal === 0) {
        issues.push({
          id: `payment-${invoice.id}`,
          severity: "warning",
          title: "Paid invoice has no reconciliation payment record",
          detail: invoice.invoice_number ?? invoice.id,
          href: `/invoices/${invoice.id}`,
        });
      }
    }

    const critical = issues.filter((issue) => issue.severity === "critical").length;
    const warnings = issues.filter((issue) => issue.severity === "warning").length;
    const ready = critical === 0;

    return {
      issues,
      critical,
      warnings,
      ready,
      completedUninvoiced: jobs.filter(
        (job) => job.job_status === "completed" && !invoicedJobs.has(job.id),
      ).length,
      completionRequested: jobs.filter((job) => job.job_status === "completion_requested").length,
      openInvoices: invoices.filter((invoice) => !["paid", "void"].includes(invoice.invoice_status ?? "")).length,
      recordedPayments: payments.length,
    };
  }, [activities, dispatchAssignments, invoiceLinks, invoices, jobs, payments, photos, timeEntries]);

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">Pilot QA</h1>
        <p className="font-bold text-gray-500">Running workflow integrity checks…</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">Production Readiness</p>
          <h1 className="mt-1 text-3xl font-black">End-to-End Pilot QA</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Validate the real Bakerss workflow from work-order creation through dispatch, technician completion, billing, and payment reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/operations" className="rounded-xl border bg-white px-5 py-3 text-sm font-black text-gray-800">
            Operations
          </Link>
          <button
            type="button"
            onClick={() => void loadQa(true)}
            disabled={isRefreshing}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isRefreshing ? "Checking…" : "Run QA Again"}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          QA could not complete: {errorMessage}
        </div>
      )}

      <section className={`rounded-2xl border p-6 shadow-sm ${qa.ready ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        <p className="text-xs font-black uppercase tracking-wide text-gray-600">Pilot Gate</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className={`text-2xl font-black ${qa.ready ? "text-green-900" : "text-red-900"}`}>
              {qa.ready ? "No critical workflow blockers detected" : `${qa.critical} critical blocker${qa.critical === 1 ? "" : "s"} detected`}
            </h2>
            <p className="mt-1 text-sm font-bold text-gray-700">
              {qa.warnings} warning{qa.warnings === 1 ? "" : "s"}. Use a real test work order below to validate every handoff.
            </p>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-black uppercase ${qa.ready ? "bg-green-700 text-white" : "bg-red-700 text-white"}`}>
            {qa.ready ? "Pilot Ready" : "Fix Blockers"}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Completion Requests" value={qa.completionRequested} href="/work-orders/completion-review" />
        <Metric label="Completed / Uninvoiced" value={qa.completedUninvoiced} href="/work-orders" warning={qa.completedUninvoiced > 0} />
        <Metric label="Open Invoices" value={qa.openInvoices} href="/invoices" />
        <Metric label="Payment Records" value={qa.recordedPayments} href="/invoices/payments" />
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-gray-500">Pilot Script</p>
        <h2 className="mt-1 text-xl font-black">Run one real test job all the way through</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-7">
          <Step number="1" title="Create" href="/work-orders/new" detail="Create test work order" />
          <Step number="2" title="Schedule" href="/schedule" detail="Assign tech + time" />
          <Step number="3" title="Dispatch" href="/dispatch" detail="Verify assignment" />
          <Step number="4" title="Technician" href="/technician" detail="Ack, time, photos, materials" />
          <Step number="5" title="Review" href="/work-orders/completion-review" detail="Approve completion" />
          <Step number="6" title="Invoice" href="/invoices" detail="Create and verify invoice" />
          <Step number="7" title="Payment" href="/invoices/payments" detail="Record/reconcile payment" />
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">Workflow Integrity Findings</h2>
          <p className="mt-1 text-sm font-bold text-gray-500">
            Critical items block a clean pilot. Warnings identify records that should be reviewed.
          </p>
        </header>
        <div className="divide-y">
          {qa.issues.map((issue) => (
            <div key={issue.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${severityClass(issue.severity)}`}>
                  {issue.severity}
                </span>
                <h3 className="mt-2 font-black text-gray-950">{issue.title}</h3>
                <p className="mt-1 text-sm font-bold text-gray-500">{issue.detail}</p>
              </div>
              <Link href={issue.href} className="rounded-xl bg-gray-950 px-4 py-2 text-center text-sm font-black text-white">
                Review
              </Link>
            </div>
          ))}
          {qa.issues.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-lg font-black text-green-800">No workflow integrity findings.</p>
              <p className="mt-2 text-sm font-bold text-gray-500">Run the seven-step pilot script with a test job before general rollout.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, href, warning = false }: { label: string; value: number; href: string; warning?: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 ${warning ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-gray-950">{value}</p>
    </Link>
  );
}

function Step({ number, title, detail, href }: { number: string; title: string; detail: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border bg-gray-50 p-4 transition hover:bg-white hover:shadow-sm">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-950 text-sm font-black text-white">{number}</span>
      <h3 className="mt-3 font-black text-gray-950">{title}</h3>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">{detail}</p>
    </Link>
  );
}

function severityClass(severity: QaIssue["severity"]) {
  if (severity === "critical") return "bg-red-700 text-white";
  if (severity === "warning") return "bg-amber-600 text-white";
  return "bg-blue-100 text-blue-800";
}
