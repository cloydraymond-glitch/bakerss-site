"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Relation<T> = T | T[] | null;

type Client = {
  client_name: string | null;
};

type Property = {
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
};

type Employee = {
  full_name: string | null;
};

type Service = {
  service_name: string | null;
};

type Job = {
  id: string;
  job_title: string | null;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  estimated_duration_minutes: number | null;
  created_at: string | null;
  clients: Relation<Client>;
  properties: Relation<Property>;
  employees: Relation<Employee>;
  services: Relation<Service>;
};

type Filter =
  | "all"
  | "open"
  | "scheduled"
  | "in_progress"
  | "completion_requested"
  | "completed"
  | "cancelled";

export default function WorkOrdersPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadJobs = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        job_title,
        job_status,
        priority,
        scheduled_start,
        estimated_price,
        estimated_duration_minutes,
        created_at,
        clients ( client_name ),
        properties (
          property_name,
          street_address,
          city,
          state
        ),
        employees ( full_name ),
        services ( service_name )
      `)
      .order("scheduled_start", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setErrorMessage(error.message);
      setJobs([]);
    } else {
      setJobs((data ?? []) as unknown as Job[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const summary = useMemo(() => {
    const normalized = jobs.map((job) =>
      normalizeStatus(job.job_status),
    );

    return {
      total: jobs.length,
      open: normalized.filter(
        (status) =>
          status !== "completed" &&
          status !== "cancelled",
      ).length,
      scheduled: normalized.filter(
        (status) => status === "scheduled",
      ).length,
      inProgress: normalized.filter(
        (status) => status === "in_progress",
      ).length,
      review: normalized.filter(
        (status) => status === "completion_requested",
      ).length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return jobs.filter((job) => {
      const status = normalizeStatus(job.job_status);

      if (
        filter === "open" &&
        (status === "completed" || status === "cancelled")
      ) {
        return false;
      }

      if (
        filter !== "all" &&
        filter !== "open" &&
        status !== filter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const client = normalizeRelation(job.clients);
      const property = normalizeRelation(job.properties);
      const employee = normalizeRelation(job.employees);
      const service = normalizeRelation(job.services);

      const values = [
        job.job_title,
        client?.client_name,
        property?.property_name,
        property?.street_address,
        property?.city,
        employee?.full_name,
        service?.service_name,
        job.job_status,
        job.priority,
      ];

      return values.some((value) =>
        value?.toLowerCase().includes(query),
      );
    });
  }, [filter, jobs, searchText]);

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">Work Orders</h1>
        <p className="text-gray-600">Loading work orders…</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Operations
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Work Orders
          </h1>

          <p className="mt-2 max-w-3xl text-gray-600">
            Create, schedule, assign, track, and complete customer work.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadJobs(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/dispatch"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800"
          >
            Dispatch
          </Link>

          <Link
            href="/work-orders/new"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white"
          >
            + New Work Order
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total"
          value={summary.total.toString()}
        />
        <SummaryCard
          label="Open"
          value={summary.open.toString()}
        />
        <SummaryCard
          label="Scheduled"
          value={summary.scheduled.toString()}
        />
        <SummaryCard
          label="In Progress"
          value={summary.inProgress.toString()}
        />
        <SummaryCard
          label="Needs Review"
          value={summary.review.toString()}
          warning={summary.review > 0}
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <label>
            <span className="mb-2 block text-sm font-black">
              Search Work Orders
            </span>
            <input
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="Title, customer, address, technician, or service"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["open", "Open"],
                ["all", "All"],
                ["scheduled", "Scheduled"],
                ["in_progress", "In Progress"],
                ["completion_requested", "Review"],
                ["completed", "Completed"],
                ["cancelled", "Cancelled"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-xl px-4 py-3 text-sm font-black ${
                  filter === value
                    ? "bg-gray-950 text-white"
                    : "border border-gray-300 bg-white text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <TableHeading>Work Order</TableHeading>
                <TableHeading>Customer / Property</TableHeading>
                <TableHeading>Service</TableHeading>
                <TableHeading>Technician</TableHeading>
                <TableHeading>Schedule</TableHeading>
                <TableHeading>Duration</TableHeading>
                <TableHeading>Status</TableHeading>
                <TableHeading>Priority</TableHeading>
                <TableHeading>Value</TableHeading>
                <TableHeading />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredJobs.map((job) => {
                const client = normalizeRelation(job.clients);
                const property = normalizeRelation(
                  job.properties,
                );
                const employee = normalizeRelation(
                  job.employees,
                );
                const service = normalizeRelation(job.services);
                const status = normalizeStatus(
                  job.job_status,
                );

                return (
                  <tr key={job.id}>
                    <TableCell>
                      <div className="min-w-[220px]">
                        <Link
                          href={`/work-orders/${job.id}`}
                          className="font-black text-gray-950 hover:underline"
                        >
                          {job.job_title ||
                            "Untitled Work Order"}
                        </Link>
                        <p className="mt-1 text-xs text-gray-500">
                          Created{" "}
                          {formatDate(job.created_at)}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="min-w-[220px]">
                        <p className="font-bold text-gray-950">
                          {client?.client_name || "—"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {propertyLabel(property)}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="font-bold">
                        {service?.service_name || "—"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="font-bold">
                        {employee?.full_name || "Unassigned"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="min-w-[150px]">
                        {formatDateTime(job.scheduled_start)}
                      </div>
                    </TableCell>

                    <TableCell>
                      {formatDuration(
                        job.estimated_duration_minutes,
                      )}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>

                    <TableCell>
                      <PriorityBadge
                        priority={job.priority}
                      />
                    </TableCell>

                    <TableCell>
                      <span className="font-black">
                        {formatCurrency(
                          job.estimated_price,
                        )}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Link
                        href={`/work-orders/${job.id}`}
                        className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </tr>
                );
              })}

              {filteredJobs.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-12 text-center"
                  >
                    <p className="font-black text-gray-700">
                      No work orders found.
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Adjust the filter or create a new work order.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        warning
          ? "border-amber-200 bg-amber-50"
          : "bg-white"
      }`}
    >
      <p className="text-sm font-black text-gray-500">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-black ${
          warning ? "text-amber-800" : "text-gray-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TableHeading({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="px-5 py-4 align-middle text-sm text-gray-700">
      {children}
    </td>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "completed"
      ? "bg-green-100 text-green-800"
      : status === "in_progress"
        ? "bg-blue-100 text-blue-800"
        : status === "completion_requested"
          ? "bg-amber-100 text-amber-800"
          : status === "cancelled"
            ? "bg-red-100 text-red-800"
            : "bg-gray-100 text-gray-700";

  return (
    <span
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black uppercase ${className}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: string | null;
}) {
  const normalized = (
    priority || "normal"
  ).toLowerCase();

  const className =
    normalized === "urgent"
      ? "bg-red-100 text-red-800"
      : normalized === "high"
        ? "bg-orange-100 text-orange-800"
        : "bg-gray-100 text-gray-700";

  return (
    <span
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black uppercase ${className}`}
    >
      {normalized}
    </span>
  );
}

function normalizeStatus(value: string | null) {
  return (value || "new")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function normalizeRelation<T>(
  value: Relation<T>,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function propertyLabel(property: Property | null) {
  if (!property) {
    return "—";
  }

  const main =
    property.property_name ||
    property.street_address ||
    "Property";

  const location = [
    property.street_address,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(", ");

  if (!location || location === main) {
    return main;
  }

  return `${main} — ${location}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDuration(minutes: number | null) {
  if (
    minutes === null ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return "—";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder} min`;
  }

  if (remainder === 0) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  return `${hours}h ${remainder}m`;
}

function formatCurrency(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}