"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  employment_status: string | null;
};

type Client = {
  id: string;
  client_name: string;
};

type Property = {
  id: string;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
};

type Job = {
  id: string;
  client_id: string | null;
  property_id: string | null;
  job_title: string;
  job_description: string | null;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assigned_employee_id: string | null;
};

type DraftAssignment = {
  employeeId: string;
  time: string;
};

export default function DailyRouteBoardPage() {
  const [selectedDate, setSelectedDate] = useState(
    getTodayInput(),
  );

  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [drafts, setDrafts] = useState<
    Record<string, DraftAssignment>
  >({});

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingJobId, setSavingJobId] = useState<string | null>(
    null,
  );

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPage = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const rangeStart = `${selectedDate}T00:00:00-04:00`;
      const rangeEnd = `${addDaysToDateInput(
        selectedDate,
        1,
      )}T00:00:00-04:00`;

      const [
        jobsResponse,
        employeesResponse,
        clientsResponse,
        propertiesResponse,
      ] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            client_id,
            property_id,
            job_title,
            job_description,
            job_status,
            priority,
            scheduled_start,
            scheduled_end,
            assigned_employee_id
          `)
          .gte("scheduled_start", rangeStart)
          .lt("scheduled_start", rangeEnd)
          .order("scheduled_start", { ascending: true }),

        supabase
          .from("employees")
          .select(`
            id,
            full_name,
            job_title,
            employment_status
          `)
          .eq("employment_status", "active")
          .order("full_name", { ascending: true }),

        supabase
          .from("clients")
          .select("id, client_name"),

        supabase
          .from("properties")
          .select(`
            id,
            property_name,
            street_address,
            city,
            state
          `),
      ]);

      const firstError =
        jobsResponse.error ||
        employeesResponse.error ||
        clientsResponse.error ||
        propertiesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setJobs([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const loadedJobs = (jobsResponse.data ?? []) as Job[];

      setJobs(loadedJobs);
      setEmployees(
        (employeesResponse.data ?? []) as Employee[],
      );
      setClients((clientsResponse.data ?? []) as Client[]);
      setProperties(
        (propertiesResponse.data ?? []) as Property[],
      );

      const nextDrafts: Record<string, DraftAssignment> = {};

      for (const job of loadedJobs) {
        nextDrafts[job.id] = {
          employeeId: job.assigned_employee_id ?? "",
          time: getTimePart(job.scheduled_start),
        };
      }

      setDrafts(nextDrafts);
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [selectedDate],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const clientMap = useMemo(
    () =>
      new Map(
        clients.map((client) => [client.id, client]),
      ),
    [clients],
  );

  const propertyMap = useMemo(
    () =>
      new Map(
        properties.map((property) => [
          property.id,
          property,
        ]),
      ),
    [properties],
  );

  const groupedByTechnician = useMemo(() => {
    const groups = new Map<string, Job[]>();

    groups.set("unassigned", []);

    for (const employee of employees) {
      groups.set(employee.id, []);
    }

    for (const job of jobs) {
      const key =
        job.assigned_employee_id &&
        groups.has(job.assigned_employee_id)
          ? job.assigned_employee_id
          : "unassigned";

      groups.get(key)?.push(job);
    }

    const orderedGroups: Array<{
      key: string;
      employee: Employee | null;
      jobs: Job[];
    }> = [];

    const unassignedJobs =
      groups.get("unassigned") ?? [];

    if (unassignedJobs.length > 0) {
      orderedGroups.push({
        key: "unassigned",
        employee: null,
        jobs: sortJobs(unassignedJobs),
      });
    }

    for (const employee of employees) {
      orderedGroups.push({
        key: employee.id,
        employee,
        jobs: sortJobs(groups.get(employee.id) ?? []),
      });
    }

    return orderedGroups;
  }, [employees, jobs]);

  const assignedCount = jobs.filter(
    (job) => Boolean(job.assigned_employee_id),
  ).length;

  const unassignedCount = jobs.length - assignedCount;

  function updateDraft(
    jobId: string,
    patch: Partial<DraftAssignment>,
  ) {
    setDrafts((current) => ({
      ...current,
      [jobId]: {
        employeeId: current[jobId]?.employeeId ?? "",
        time: current[jobId]?.time ?? "09:00",
        ...patch,
      },
    }));
  }

  async function saveAssignment(job: Job) {
    const draft = drafts[job.id];

    if (!draft?.time) {
      setErrorMessage("A scheduled time is required.");
      setSuccessMessage("");
      return;
    }

    setSavingJobId(job.id);
    setErrorMessage("");
    setSuccessMessage("");

    const scheduledStart = `${selectedDate}T${draft.time}:00-04:00`;

    const { error } = await supabase
      .from("jobs")
      .update({
        assigned_employee_id:
          draft.employeeId || null,
        scheduled_start: scheduledStart,
      })
      .eq("id", job.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingJobId(null);
      return;
    }

    setSuccessMessage(
      `${job.job_title} was updated successfully.`,
    );

    setSavingJobId(null);
    await loadPage(true);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Daily Route Board
        </h1>

        <p className="text-gray-600">
          Loading daily routes…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Dispatch
          </p>

          <h1 className="mt-1 text-3xl font-black text-gray-950">
            Daily Route Board
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Review technician workloads, correct assignments,
            and print the day’s route sheet.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Print Route Sheet
          </button>

          <button
            type="button"
            onClick={() => void loadPage(true)}
            disabled={
              isRefreshing || Boolean(savingJobId)
            }
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/schedule"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Upcoming Schedule
          </Link>
        </div>
      </header>

      <header className="hidden print:block">
        <h1 className="text-3xl font-black">
          Bakerss Property Services
        </h1>

        <p className="mt-1 text-lg font-bold">
          Daily Route Sheet · {formatDate(selectedDate)}
        </p>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 print:hidden">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800 print:hidden">
          {successMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <SummaryCard
          title="Total Jobs"
          value={String(jobs.length)}
        />

        <SummaryCard
          title="Assigned"
          value={String(assignedCount)}
        />

        <SummaryCard
          title="Unassigned"
          value={String(unassignedCount)}
          warning={unassignedCount > 0}
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm print:hidden">
        <div className="max-w-sm">
          <label className="mb-2 block text-sm font-black">
            Route Date
          </label>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
          />
        </div>
      </section>

      {jobs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <h2 className="text-xl font-black">
            No work orders scheduled
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            Select another date or create jobs from recurring
            services.
          </p>
        </section>
      ) : (
        <section className="space-y-6">
          {groupedByTechnician.map(
            ({ key, employee, jobs: employeeJobs }) => (
              <section
                key={key}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  key === "unassigned"
                    ? "border-amber-300"
                    : ""
                }`}
              >
                <header
                  className={`border-b px-5 py-4 ${
                    key === "unassigned"
                      ? "bg-amber-50"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black text-gray-950">
                        {employee?.full_name ??
                          "Unassigned Work Orders"}
                      </h2>

                      <p className="mt-1 text-sm font-bold text-gray-500">
                        {employee?.job_title ??
                          "Assignment required"}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-gray-700">
                      {employeeJobs.length} job
                      {employeeJobs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </header>

                {employeeJobs.length === 0 ? (
                  <div className="p-5 text-sm font-bold text-gray-500">
                    No jobs assigned.
                  </div>
                ) : (
                  <div className="divide-y">
                    {employeeJobs.map((job, index) => {
                      const client = job.client_id
                        ? clientMap.get(job.client_id)
                        : null;

                      const property = job.property_id
                        ? propertyMap.get(job.property_id)
                        : null;

                      const draft = drafts[job.id] ?? {
                        employeeId:
                          job.assigned_employee_id ?? "",
                        time: getTimePart(
                          job.scheduled_start,
                        ),
                      };

                      return (
                        <article
                          key={job.id}
                          className="p-5"
                        >
                          <div className="grid gap-5 xl:grid-cols-[90px_1.2fr_1fr_auto] xl:items-center">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                                Stop
                              </p>

                              <p className="mt-1 text-2xl font-black text-gray-950">
                                {index + 1}
                              </p>

                              <p className="mt-1 text-sm font-black text-bakerssPink">
                                {formatTime(
                                  job.scheduled_start,
                                )}
                              </p>
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/work-orders/${job.id}`}
                                  className="text-lg font-black text-gray-950 hover:text-bakerssPink"
                                >
                                  {job.job_title}
                                </Link>

                                <StatusBadge
                                  value={job.job_status}
                                />

                                {job.priority &&
                                  job.priority !== "normal" && (
                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                                      {formatText(
                                        job.priority,
                                      )}
                                    </span>
                                  )}
                              </div>

                              <p className="mt-2 font-bold text-gray-700">
                                {client?.client_name ??
                                  "No client assigned"}
                              </p>

                              <p className="mt-1 text-sm text-gray-500">
                                {formatProperty(property)}
                              </p>

                              {job.job_description && (
                                <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                                  {job.job_description}
                                </p>
                              )}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 print:hidden">
                              <label>
                                <span className="mb-2 block text-sm font-black">
                                  Technician
                                </span>

                                <select
                                  value={draft.employeeId}
                                  onChange={(event) =>
                                    updateDraft(job.id, {
                                      employeeId:
                                        event.target.value,
                                    })
                                  }
                                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                                >
                                  <option value="">
                                    Unassigned
                                  </option>

                                  {employees.map(
                                    (employeeOption) => (
                                      <option
                                        key={
                                          employeeOption.id
                                        }
                                        value={
                                          employeeOption.id
                                        }
                                      >
                                        {
                                          employeeOption.full_name
                                        }
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>

                              <label>
                                <span className="mb-2 block text-sm font-black">
                                  Time
                                </span>

                                <input
                                  type="time"
                                  value={draft.time}
                                  onChange={(event) =>
                                    updateDraft(job.id, {
                                      time: event.target.value,
                                    })
                                  }
                                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                                />
                              </label>
                            </div>

                            <div className="print:hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  void saveAssignment(job)
                                }
                                disabled={Boolean(savingJobId)}
                                className="rounded-xl bg-bakerssPink px-4 py-2.5 text-sm font-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savingJobId === job.id
                                  ? "Saving…"
                                  : "Save"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ),
          )}
        </section>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  value,
  warning = false,
}: {
  title: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        warning ? "border-amber-300 bg-amber-50" : ""
      }`}
    >
      <p className="text-sm font-black text-gray-500">
        {title}
      </p>

      <p className="mt-2 text-3xl font-black text-gray-950">
        {value}
      </p>
    </section>
  );
}

function StatusBadge({
  value,
}: {
  value: string | null;
}) {
  const status = value ?? "unknown";

  const classes =
    status === "completed"
      ? "bg-green-100 text-green-800"
      : status === "cancelled"
        ? "bg-red-100 text-red-800"
        : status === "in_progress"
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-700";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${classes}`}
    >
      {formatText(status)}
    </span>
  );
}

function sortJobs(items: Job[]) {
  return [...items].sort((a, b) =>
    (a.scheduled_start ?? "").localeCompare(
      b.scheduled_start ?? "",
    ),
  );
}

function getTodayInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysToDateInput(
  value: string,
  days: number,
) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0",
  );
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTimePart(value: string | null) {
  if (!value) {
    return "09:00";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16) || "09:00";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

function formatTime(value: string | null) {
  if (!value) {
    return "No time";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatProperty(
  property: Property | null | undefined,
) {
  if (!property) {
    return "No property assigned";
  }

  const name =
    property.property_name?.trim() ||
    property.street_address?.trim() ||
    "Property";

  const location = [
    property.street_address &&
    property.street_address !== name
      ? property.street_address
      : null,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(" · ");

  return location ? `${name} · ${location}` : name;
}

function formatText(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}