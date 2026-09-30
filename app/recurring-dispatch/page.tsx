"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type RecurringService = {
  id: string;
  service_name: string;
  active: boolean | null;
  clients: { client_name: string } | null;
  properties: {
    property_name: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

type RecurringOccurrence = {
  id: string;
  recurring_service_id: string;
  job_id: string | null;
  scheduled_date: string;
  scheduled_start: string | null;
  occurrence_status: string;
  notes: string | null;
};

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  assigned_employee_id: string | null;
  scheduled_start: string | null;
  employees: { full_name: string } | null;
};

type Readiness =
  | "needs_work_order"
  | "needs_technician"
  | "ready"
  | "blocked";

type Filter = "all" | Readiness;

type Row = {
  occurrence: RecurringOccurrence;
  service: RecurringService | null;
  job: Job | null;
  readiness: Readiness;
};

type BulkCreateResult = {
  created_count: number;
  skipped_count: number;
  failed_count: number;
};

export default function RecurringDispatchPage() {
  const [services, setServices] = useState<RecurringService[]>([]);
  const [occurrences, setOccurrences] = useState<RecurringOccurrence[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPage = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setErrorMessage("");

    const today = getTodayInput();
    const through = addDays(today, 14);

    const [servicesResponse, occurrencesResponse, jobsResponse] =
      await Promise.all([
        supabase
          .from("recurring_services")
          .select(`
            id,
            service_name,
            active,
            clients ( client_name ),
            properties (
              property_name,
              street_address,
              city,
              state
            )
          `)
          .eq("active", true)
          .order("service_name", { ascending: true }),

        supabase
          .from("recurring_service_occurrences")
          .select(`
            id,
            recurring_service_id,
            job_id,
            scheduled_date,
            scheduled_start,
            occurrence_status,
            notes
          `)
          .gte("scheduled_date", today)
          .lte("scheduled_date", through)
          .order("scheduled_date", { ascending: true })
          .limit(500),

        supabase
          .from("jobs")
          .select(`
            id,
            job_title,
            job_status,
            assigned_employee_id,
            scheduled_start,
            employees ( full_name )
          `)
          .gte(
            "scheduled_start",
            new Date(`${today}T00:00:00`).toISOString(),
          )
          .lt(
            "scheduled_start",
            new Date(`${addDays(through, 1)}T00:00:00`).toISOString(),
          )
          .order("scheduled_start", { ascending: true }),
      ]);

    const firstError =
      servicesResponse.error ||
      occurrencesResponse.error ||
      jobsResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setServices([]);
      setOccurrences([]);
      setJobs([]);
    } else {
      setServices(
        (servicesResponse.data ?? []) as unknown as RecurringService[],
      );
      setOccurrences(
        (occurrencesResponse.data ?? []) as RecurringOccurrence[],
      );
      setJobs((jobsResponse.data ?? []) as unknown as Job[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const rows = useMemo<Row[]>(() => {
    return occurrences.map((occurrence) => {
      const service =
        services.find(
          (item) => item.id === occurrence.recurring_service_id,
        ) ?? null;

      const job =
        jobs.find((item) => item.id === occurrence.job_id) ?? null;

      let readiness: Readiness = "ready";

      if (
        ["cancelled", "skipped", "completed"].includes(
          occurrence.occurrence_status,
        )
      ) {
        readiness = "blocked";
      } else if (!occurrence.job_id) {
        readiness = "needs_work_order";
      } else if (!job?.assigned_employee_id) {
        readiness = "needs_technician";
      }

      return { occurrence, service, job, readiness };
    });
  }, [jobs, occurrences, services]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      needsWorkOrder: rows.filter(
        (row) => row.readiness === "needs_work_order",
      ).length,
      needsTechnician: rows.filter(
        (row) => row.readiness === "needs_technician",
      ).length,
      ready: rows.filter((row) => row.readiness === "ready").length,
      blocked: rows.filter((row) => row.readiness === "blocked").length,
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return rows.filter((row) => {
      if (filter !== "all" && row.readiness !== filter) {
        return false;
      }

      if (!q) {
        return true;
      }

      return [
        row.service?.service_name,
        row.service?.clients?.client_name,
        row.service?.properties?.property_name,
        row.service?.properties?.street_address,
        row.job?.job_title,
      ].some((value) => value?.toLowerCase().includes(q));
    });
  }, [filter, rows, searchText]);

  async function createWorkOrder(occurrence: RecurringOccurrence) {
    if (workingId || isBulkCreating || occurrence.job_id) {
      return;
    }

    setWorkingId(occurrence.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc(
      "create_job_from_recurring_occurrence",
      { p_occurrence_id: occurrence.id },
    );

    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }

    setSuccessMessage(`Work order created. Job ID: ${String(data)}`);
    setWorkingId(null);
    await loadPage(true);
  }

  async function createAllMissingWorkOrders() {
    if (workingId || isBulkCreating) {
      return;
    }

    setIsBulkCreating(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc(
      "create_missing_recurring_jobs",
      { p_days_ahead: 14 },
    );

    if (error) {
      setErrorMessage(error.message);
      setIsBulkCreating(false);
      return;
    }

    const result = Array.isArray(data)
      ? ((data[0] ?? null) as BulkCreateResult | null)
      : (data as BulkCreateResult | null);

    const created = Number(result?.created_count ?? 0);
    const skipped = Number(result?.skipped_count ?? 0);
    const failed = Number(result?.failed_count ?? 0);

    if (failed > 0) {
      setErrorMessage(
        `Automation finished with ${failed} failed visit${
          failed === 1 ? "" : "s"
        }.`,
      );
    }

    setSuccessMessage(
      `Recurring dispatch automation complete: ${created} created, ${skipped} skipped, ${failed} failed.`,
    );

    setIsBulkCreating(false);
    await loadPage(true);
  }

  if (isLoading) {
    return (
      <main>
        <h1 className="text-3xl font-black">Recurring → Dispatch</h1>
        <p className="mt-3 font-bold text-gray-500">
          Checking the next 14 days…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Operations Automation
          </p>
          <h1 className="mt-1 text-3xl font-black">
            Recurring → Dispatch
          </h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Confirm every recurring visit in the next 14 days has a
            work order and technician assignment.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/recurring"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800"
          >
            Recurring Services
          </Link>

          <Link
            href="/dispatch"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white"
          >
            Open Dispatch
          </Link>

          <button
            type="button"
            onClick={() => void loadPage(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 disabled:opacity-50"
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

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {successMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Upcoming Visits" value={summary.total} />
        <SummaryCard
          label="Need Work Order"
          value={summary.needsWorkOrder}
          warning={summary.needsWorkOrder > 0}
        />
        <SummaryCard
          label="Need Technician"
          value={summary.needsTechnician}
          warning={summary.needsTechnician > 0}
        />
        <SummaryCard
          label="Dispatch Ready"
          value={summary.ready}
          positive={summary.ready > 0}
        />
        <SummaryCard label="Skipped / Closed" value={summary.blocked} />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-[1fr_260px]">
            <label>
              <span className="mb-2 block text-sm font-black">Search</span>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Service, client, property, or work order"
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black">
                Readiness
              </span>
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as Filter)
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="all">All visits</option>
                <option value="needs_work_order">Need work order</option>
                <option value="needs_technician">Need technician</option>
                <option value="ready">Dispatch ready</option>
                <option value="blocked">Skipped / closed</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => void createAllMissingWorkOrders()}
            disabled={
              isBulkCreating ||
              Boolean(workingId) ||
              summary.needsWorkOrder === 0
            }
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isBulkCreating
              ? "Running Automation…"
              : `Create Missing Work Orders (${summary.needsWorkOrder})`}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {filteredRows.map((row) => (
          <article
            key={row.occurrence.id}
            className={`rounded-2xl border p-5 shadow-sm ${cardClasses(
              row.readiness,
            )}`}
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black uppercase ${badgeClasses(
                      row.readiness,
                    )}`}
                  >
                    {readinessLabel(row.readiness)}
                  </span>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-gray-700">
                    {formatStatus(row.occurrence.occurrence_status)}
                  </span>
                </div>

                <h2 className="mt-3 text-xl font-black">
                  {row.service?.service_name || "Recurring Service"}
                </h2>

                <p className="mt-2 text-sm font-bold text-gray-700">
                  {row.service?.clients?.client_name || "No customer"}
                  {" · "}
                  {row.service?.properties
                    ? formatProperty(row.service.properties)
                    : "No property"}
                </p>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
                  <span>
                    Visit:{" "}
                    <strong>
                      {formatDate(row.occurrence.scheduled_date)}
                    </strong>
                  </span>
                  <span>
                    Time: {formatTime(row.occurrence.scheduled_start)}
                  </span>
                  <span>
                    Work Order:{" "}
                    {row.job?.job_title ||
                      (row.occurrence.job_id ? "Linked" : "Not created")}
                  </span>
                  <span>
                    Technician:{" "}
                    {row.job?.employees?.full_name || "Unassigned"}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-3">
                {row.readiness === "needs_work_order" && (
                  <button
                    type="button"
                    onClick={() => void createWorkOrder(row.occurrence)}
                    disabled={Boolean(workingId) || isBulkCreating}
                    className="rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {workingId === row.occurrence.id
                      ? "Creating…"
                      : "Create Work Order"}
                  </button>
                )}

                {row.occurrence.job_id && (
                  <Link
                    href={`/work-orders/${row.occurrence.job_id}`}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800"
                  >
                    Open Work Order
                  </Link>
                )}

                {row.readiness === "needs_technician" && (
                  <Link
                    href="/dispatch"
                    className="rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white"
                  >
                    Assign in Dispatch
                  </Link>
                )}

                {row.readiness === "ready" && (
                  <Link
                    href="/dispatch"
                    className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white"
                  >
                    View Dispatch
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
            <h2 className="text-xl font-black">No recurring visits found</h2>
            <p className="mt-2 text-sm font-bold text-gray-500">
              No visits match the current 14-day readiness filter.
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
  warning = false,
  positive = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        warning
          ? "border-red-200 bg-red-50"
          : positive
            ? "border-green-200 bg-green-50"
            : "bg-white"
      }`}
    >
      <p className="text-sm font-black text-gray-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-black ${
          warning
            ? "text-red-800"
            : positive
              ? "text-green-800"
              : "text-gray-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function getTodayInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(input: string, days: number) {
  const date = new Date(`${input}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatProperty(
  property: NonNullable<RecurringService["properties"]>,
) {
  return (
    property.property_name ||
    [property.street_address, property.city, property.state]
      .filter(Boolean)
      .join(", ") ||
    "Unnamed property"
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(date);
}

function formatTime(value: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not set"
    : new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readinessLabel(value: Readiness) {
  if (value === "needs_work_order") return "Needs Work Order";
  if (value === "needs_technician") return "Needs Technician";
  if (value === "ready") return "Dispatch Ready";
  return "Skipped / Closed";
}

function cardClasses(value: Readiness) {
  if (value === "needs_work_order") return "border-red-200 bg-red-50";
  if (value === "needs_technician") return "border-amber-200 bg-amber-50";
  if (value === "ready") return "border-green-200 bg-green-50";
  return "border-gray-300 bg-gray-100";
}

function badgeClasses(value: Readiness) {
  if (value === "needs_work_order") return "bg-red-700 text-white";
  if (value === "needs_technician") return "bg-amber-700 text-white";
  if (value === "ready") return "bg-green-700 text-white";
  return "bg-gray-700 text-white";
}