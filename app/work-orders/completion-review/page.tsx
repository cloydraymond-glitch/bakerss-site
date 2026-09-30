"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase/client";

type Client = { client_name: string };
type Property = { property_name: string | null; street_address: string | null };
type Employee = { full_name: string };

type WorkOrder = {
  id: string;
  job_title: string;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  materials_cost: number | null;
  assigned_employee_id: string | null;
  clients: Client | Client[] | null;
  properties: Property | Property[] | null;
  employees: Employee | Employee[] | null;
};

type JobPhoto = { id: string; job_id: string; photo_type: string | null };
type JobTimeEntry = {
  id: string;
  job_id: string | null;
  clock_in_time: string;
  clock_out_time: string | null;
  entry_type: string;
};
type ActivityEntry = {
  id: string;
  entity_id: string | null;
  action: string;
  metadata: { note?: string | null; message?: string | null } | null;
  created_at: string;
};

type ReviewRow = {
  workOrder: WorkOrder;
  client: Client | null;
  property: Property | null;
  employee: Employee | null;
  completionRequest: ActivityEntry | null;
  completionPhotoCount: number;
  closedTimeCount: number;
  hasOpenTimer: boolean;
  totalMinutes: number;
  readyCount: number;
  requirementCount: number;
  isReady: boolean;
};

export default function CompletionReviewQueuePage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [timeEntries, setTimeEntries] = useState<JobTimeEntry[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<"all" | "ready" | "blocked">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadQueue = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoading(true);

    setErrorMessage("");

    const workOrdersResponse = await supabase
      .from("jobs")
      .select(`
        id,
        job_title,
        job_status,
        priority,
        scheduled_start,
        estimated_price,
        materials_cost,
        assigned_employee_id,
        clients ( client_name ),
        properties ( property_name, street_address ),
        employees ( full_name )
      `)
      .eq("job_status", "completion_requested")
      .order("scheduled_start", { ascending: true, nullsFirst: false });

    if (workOrdersResponse.error) {
      setErrorMessage(workOrdersResponse.error.message);
      setWorkOrders([]);
      setPhotos([]);
      setTimeEntries([]);
      setActivities([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const loadedWorkOrders = (workOrdersResponse.data ?? []) as unknown as WorkOrder[];
    const jobIds = loadedWorkOrders.map((workOrder) => workOrder.id);
    setWorkOrders(loadedWorkOrders);

    if (jobIds.length === 0) {
      setPhotos([]);
      setTimeEntries([]);
      setActivities([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const [photosResponse, timeResponse, activityResponse] = await Promise.all([
      supabase
        .from("job_photos")
        .select("id, job_id, photo_type")
        .in("job_id", jobIds),
      supabase
        .from("employee_timeclock")
        .select("id, job_id, clock_in_time, clock_out_time, entry_type")
        .eq("entry_type", "job")
        .in("job_id", jobIds),
      supabase
        .from("activity_log")
        .select("id, entity_id, action, metadata, created_at")
        .eq("entity_type", "job")
        .eq("action", "technician_completion_requested")
        .in("entity_id", jobIds)
        .order("created_at", { ascending: false }),
    ]);

    const firstError = photosResponse.error || timeResponse.error || activityResponse.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      setPhotos([]);
      setTimeEntries([]);
      setActivities([]);
    } else {
      setPhotos((photosResponse.data ?? []) as JobPhoto[]);
      setTimeEntries((timeResponse.data ?? []) as JobTimeEntry[]);
      setActivities((activityResponse.data ?? []) as ActivityEntry[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const reviewRows = useMemo<ReviewRow[]>(() => {
    return workOrders.map((workOrder) => {
      const jobPhotos = photos.filter((photo) => photo.job_id === workOrder.id);
      const completionPhotoCount = jobPhotos.filter((photo) => photo.photo_type === "completion").length;
      const jobTimeEntries = timeEntries.filter((entry) => entry.job_id === workOrder.id);
      const closedTimeEntries = jobTimeEntries.filter((entry) => Boolean(entry.clock_out_time));
      const hasOpenTimer = jobTimeEntries.some((entry) => !entry.clock_out_time);
      const totalMinutes = closedTimeEntries.reduce((total, entry) => {
        if (!entry.clock_out_time) return total;
        const start = new Date(entry.clock_in_time).getTime();
        const end = new Date(entry.clock_out_time).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) return total;
        return total + Math.max(0, end - start) / 60000;
      }, 0);

      const completionRequest = activities.find((activity) => activity.entity_id === workOrder.id) ?? null;
      const requirements = [
        Boolean(completionRequest),
        completionPhotoCount > 0,
        closedTimeEntries.length > 0,
        !hasOpenTimer,
        workOrder.estimated_price !== null && workOrder.estimated_price > 0,
        workOrder.materials_cost !== null,
      ];
      const readyCount = requirements.filter(Boolean).length;

      return {
        workOrder,
        client: normalizeRelation(workOrder.clients),
        property: normalizeRelation(workOrder.properties),
        employee: normalizeRelation(workOrder.employees),
        completionRequest,
        completionPhotoCount,
        closedTimeCount: closedTimeEntries.length,
        hasOpenTimer,
        totalMinutes,
        readyCount,
        requirementCount: requirements.length,
        isReady: readyCount === requirements.length,
      };
    });
  }, [activities, photos, timeEntries, workOrders]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return reviewRows.filter((row) => {
      if (readinessFilter === "ready" && !row.isReady) return false;
      if (readinessFilter === "blocked" && row.isReady) return false;
      if (!normalizedSearch) return true;

      return [
        row.workOrder.job_title,
        row.client?.client_name,
        row.property?.property_name,
        row.property?.street_address,
        row.employee?.full_name,
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [readinessFilter, reviewRows, searchText]);

  const summary = useMemo(() => {
    const ready = reviewRows.filter((row) => row.isReady).length;
    const blocked = reviewRows.length - ready;
    const openTimers = reviewRows.filter((row) => row.hasOpenTimer).length;
    const value = reviewRows.reduce(
      (total, row) => total + Number(row.workOrder.estimated_price ?? 0),
      0,
    );
    return { total: reviewRows.length, ready, blocked, openTimers, value };
  }, [reviewRows]);

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">Completion Review Queue</h1>
        <p className="font-bold text-gray-500">Loading completion requests…</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Work-Order Controls
          </p>
          <h1 className="mt-1 text-3xl font-black">Completion Review Queue</h1>
          <p className="mt-2 text-gray-600">
            Review technician submissions, identify missing requirements, and release completed work for billing.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/operations"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Operations Control
          </Link>
          <Link
            href="/invoices"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Billing Queue
          </Link>
          <Link
            href="/work-orders"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Work Orders
          </Link>
          <button
            type="button"
            onClick={() => void loadQueue(true)}
            disabled={isRefreshing}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh Queue"}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Awaiting Review" value={summary.total.toString()} />
        <SummaryCard label="Ready to Approve" value={summary.ready.toString()} positive={summary.ready > 0} />
        <SummaryCard label="Blocked" value={summary.blocked.toString()} warning={summary.blocked > 0} />
        <SummaryCard label="Open Job Timers" value={summary.openTimers.toString()} warning={summary.openTimers > 0} />
        <SummaryCard label="Pending Billing Value" value={formatCurrency(summary.value)} />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label>
            <span className="mb-2 block text-sm font-black">Search</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Work order, customer, property, or technician"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <FilterButton label="All" selected={readinessFilter === "all"} onClick={() => setReadinessFilter("all")} />
            <FilterButton label={`Ready (${summary.ready})`} selected={readinessFilter === "ready"} onClick={() => setReadinessFilter("ready")} />
            <FilterButton label={`Blocked (${summary.blocked})`} selected={readinessFilter === "blocked"} onClick={() => setReadinessFilter("blocked")} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {filteredRows.map((row) => (
          <article
            key={row.workOrder.id}
            className={`rounded-2xl border p-6 shadow-sm ${
              row.isReady ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                    row.isReady ? "bg-green-700 text-white" : "bg-amber-700 text-white"
                  }`}>
                    {row.isReady ? "Ready to Approve" : "Action Required"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-gray-700">
                    {row.readyCount} / {row.requirementCount} complete
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-gray-700">
                    {row.workOrder.priority ?? "normal"} priority
                  </span>
                </div>

                <h2 className="mt-3 text-xl font-black text-gray-950">{row.workOrder.job_title}</h2>
                <p className="mt-2 text-sm font-bold text-gray-700">
                  {row.client?.client_name ?? "No customer"} ·{" "}
                  {row.property?.property_name ?? row.property?.street_address ?? "No property"}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Technician: {row.employee?.full_name ?? "Unassigned"} · Scheduled:{" "}
                  {formatDate(row.workOrder.scheduled_start)}
                </p>
              </div>

              <Link
                href={`/work-orders/${row.workOrder.id}`}
                className={`shrink-0 rounded-xl px-5 py-3 text-center text-sm font-black text-white ${
                  row.isReady ? "bg-green-700" : "bg-gray-950"
                }`}
              >
                Review Work Order
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <ReadinessItem label="Completion Note" ready={Boolean(row.completionRequest)} detail={row.completionRequest ? "Submitted" : "Missing"} />
              <ReadinessItem label="Completion Photos" ready={row.completionPhotoCount > 0} detail={`${row.completionPhotoCount} uploaded`} />
              <ReadinessItem label="Production Time" ready={row.closedTimeCount > 0} detail={row.closedTimeCount > 0 ? formatDuration(row.totalMinutes) : "Not recorded"} />
              <ReadinessItem label="Active Timer" ready={!row.hasOpenTimer} detail={row.hasOpenTimer ? "Still running" : "Closed"} />
              <ReadinessItem
                label="Billing Amount"
                ready={row.workOrder.estimated_price !== null && row.workOrder.estimated_price > 0}
                detail={
                  row.workOrder.estimated_price !== null && row.workOrder.estimated_price > 0
                    ? formatCurrency(row.workOrder.estimated_price)
                    : "Missing"
                }
              />
              <ReadinessItem
                label="Materials Cost"
                ready={row.workOrder.materials_cost !== null}
                detail={
                  row.workOrder.materials_cost !== null
                    ? formatCurrency(row.workOrder.materials_cost)
                    : "Not reviewed"
                }
              />
            </div>

            {row.completionRequest?.metadata && (
              <div className="mt-5 rounded-xl border border-white bg-white/80 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Technician Completion Note
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-gray-800">
                  {row.completionRequest.metadata.note ||
                    row.completionRequest.metadata.message ||
                    "Completion request submitted."}
                </p>
              </div>
            )}
          </article>
        ))}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
            <h2 className="text-xl font-black">No completion requests found</h2>
            <p className="mt-2 text-sm font-bold text-gray-500">
              No work orders match the current search and readiness filters.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${
      warning ? "border-red-200 bg-red-50" : positive ? "border-green-200 bg-green-50" : "bg-white"
    }`}>
      <p className="text-sm font-black text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${
        warning ? "text-red-800" : positive ? "text-green-800" : "text-gray-950"
      }`}>
        {value}
      </p>
    </div>
  );
}

function FilterButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-3 text-sm font-black ${
        selected ? "bg-gray-950 text-white" : "border border-gray-300 bg-white text-gray-800"
      }`}
    >
      {label}
    </button>
  );
}

function ReadinessItem({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${
      ready ? "border-green-200 bg-white" : "border-red-200 bg-red-50"
    }`}>
      <div className="flex items-start gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${
          ready ? "bg-green-700" : "bg-red-700"
        }`}>
          {ready ? "✓" : "!"}
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-gray-600">{label}</p>
          <p className={`mt-1 text-sm font-black ${ready ? "text-green-800" : "text-red-800"}`}>
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function normalizeRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDuration(totalMinutes: number) {
  const roundedMinutes = Math.round(totalMinutes);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}