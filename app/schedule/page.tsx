"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

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

type DraftSchedule = {
  employeeId: string;
  date: string;
  time: string;
};

type EmployeeFilter = "all" | "unassigned" | string;

export default function SchedulePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [startDate, setStartDate] = useState(getTodayInput());
  const [daysToShow, setDaysToShow] = useState("14");
  const [employeeFilter, setEmployeeFilter] =
    useState<EmployeeFilter>("all");

  const [drafts, setDrafts] = useState<
    Record<string, DraftSchedule>
  >({});

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingJobId, setSavingJobId] = useState<string | null>(
    null,
  );

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const endDate = useMemo(
    () => addDaysToDateInput(startDate, Number(daysToShow) - 1),
    [daysToShow, startDate],
  );

  const loadPage = useCallback(
    async (showRefreshState = false, preserveMessage = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      if (!preserveMessage) {
        setErrorMessage("");
      }

      const rangeStart = `${startDate}T00:00:00-04:00`;
      const rangeEnd = `${addDaysToDateInput(
        endDate,
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

      const nextDrafts: Record<string, DraftSchedule> = {};

      for (const job of loadedJobs) {
        nextDrafts[job.id] = {
          employeeId: job.assigned_employee_id ?? "",
          date: getDatePart(job.scheduled_start),
          time: getTimePart(job.scheduled_start),
        };
      }

      setDrafts(nextDrafts);
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [endDate, startDate],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const employeeMap = useMemo(
    () =>
      new Map(
        employees.map((employee) => [
          employee.id,
          employee,
        ]),
      ),
    [employees],
  );

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

  const filteredJobs = useMemo(() => {
    if (employeeFilter === "all") {
      return jobs;
    }

    if (employeeFilter === "unassigned") {
      return jobs.filter(
        (job) => !job.assigned_employee_id,
      );
    }

    return jobs.filter(
      (job) =>
        job.assigned_employee_id === employeeFilter,
    );
  }, [employeeFilter, jobs]);

  const groupedJobs = useMemo(() => {
    const groups = new Map<string, Job[]>();

    for (const job of filteredJobs) {
      const date = getDatePart(job.scheduled_start);

      if (!groups.has(date)) {
        groups.set(date, []);
      }

      groups.get(date)?.push(job);
    }

    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [filteredJobs]);

  const assignedCount = jobs.filter(
    (job) => Boolean(job.assigned_employee_id),
  ).length;

  const unassignedCount = jobs.length - assignedCount;

  function updateDraft(
    jobId: string,
    patch: Partial<DraftSchedule>,
  ) {
    setDrafts((current) => ({
      ...current,
      [jobId]: {
        employeeId: current[jobId]?.employeeId ?? "",
        date: current[jobId]?.date ?? getTodayInput(),
        time: current[jobId]?.time ?? "09:00",
        ...patch,
      },
    }));
  }

  async function syncOpenDispatchAssignment(
    jobId: string,
    employeeId: string | null,
  ) {
    const { data: openAssignments, error: lookupError } = await supabase
      .from("dispatch_assignments")
      .select("id, employee_id")
      .eq("job_id", jobId)
      .is("closed_at", null);

    if (lookupError) {
      return lookupError;
    }

    const currentAssignments = openAssignments ?? [];
    const matchingAssignment = employeeId
      ? currentAssignments.find(
          (assignment) => assignment.employee_id === employeeId,
        )
      : null;

    const assignmentsToClose = currentAssignments.filter(
      (assignment) => !matchingAssignment || assignment.id !== matchingAssignment.id,
    );

    if (assignmentsToClose.length > 0) {
      const now = new Date().toISOString();
      const { error: closeError } = await supabase
        .from("dispatch_assignments")
        .update({
          assignment_status: "closed",
          closed_at: now,
        })
        .in(
          "id",
          assignmentsToClose.map((assignment) => assignment.id),
        );

      if (closeError) {
        return closeError;
      }
    }

    if (employeeId && !matchingAssignment) {
      const { error: insertError } = await supabase
        .from("dispatch_assignments")
        .insert({
          job_id: jobId,
          employee_id: employeeId,
          assignment_status: "assigned",
          assigned_at: new Date().toISOString(),
        });

      if (insertError) {
        return insertError;
      }
    }

    return null;
  }

  async function saveJob(job: Job) {
    const draft = drafts[job.id];

    if (!draft?.date || !draft.time) {
      setErrorMessage(
        "Each scheduled job requires a date and time.",
      );
      setSuccessMessage("");
      return;
    }

    setSavingJobId(job.id);
    setErrorMessage("");
    setSuccessMessage("");

    const scheduledStart = `${draft.date}T${draft.time}:00-04:00`;

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

    const dispatchError = await syncOpenDispatchAssignment(
      job.id,
      draft.employeeId || null,
    );

    if (dispatchError) {
      await supabase
        .from("jobs")
        .update({ assigned_employee_id: job.assigned_employee_id })
        .eq("id", job.id);

      setErrorMessage(
        `Schedule saved, but dispatch assignment could not be synchronized: ${dispatchError.message}`,
      );
      setSavingJobId(null);
      await loadPage(true, true);
      return;
    }

    setSuccessMessage(
      `${job.job_title} was scheduled and dispatched successfully.`,
    );

    setSavingJobId(null);
    await loadPage(true, true);
  }

  async function clearAssignment(job: Job) {
    setSavingJobId(job.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("jobs")
      .update({
        assigned_employee_id: null,
      })
      .eq("id", job.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingJobId(null);
      return;
    }

    const dispatchError = await syncOpenDispatchAssignment(job.id, null);

    if (dispatchError) {
      await supabase
        .from("jobs")
        .update({ assigned_employee_id: job.assigned_employee_id })
        .eq("id", job.id);

      setErrorMessage(
        `Work order could not be fully unassigned from dispatch: ${dispatchError.message}`,
      );
      setSavingJobId(null);
      await loadPage(true);
      return;
    }

    setSuccessMessage(
      `${job.job_title} is now unassigned.`,
    );

    setSavingJobId(null);
    await loadPage(true);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Upcoming Schedule
        </h1>

        <p className="text-gray-600">
          Loading scheduled work orders…
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

          <h1 className="mt-1 text-3xl font-black text-gray-950">
            Upcoming Schedule
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Assign active technicians and adjust the scheduled
            date or time for upcoming work orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/operations"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50"
          >
            Operations Control
          </Link>

          <Link
            href="/dispatch"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50"
          >
            Dispatch Board
          </Link>

          <button
            type="button"
            onClick={() => void loadPage(true)}
            disabled={
              isRefreshing || Boolean(savingJobId)
            }
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/schedule/daily"
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
          >
            Daily Route Board
          </Link>

          <Link
            href="/work-orders"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
          >
            Work Orders
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
          {successMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Scheduled Jobs"
          value={String(jobs.length)}
        />

        <SummaryCard
          title="Assigned"
          value={String(assignedCount)}
        />

        <SummaryCard
          title="Unassigned"
          value={String(unassignedCount)}
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Schedule Starts">
            <input
              type="date"
              value={startDate}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
              className={inputClassName}
            />
          </Field>

          <Field label="Range">
            <select
              value={daysToShow}
              onChange={(event) =>
                setDaysToShow(event.target.value)
              }
              className={inputClassName}
            >
              <option value="7">Next 7 days</option>
              <option value="14">Next 14 days</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
          </Field>

          <Field label="Technician">
            <select
              value={employeeFilter}
              onChange={(event) =>
                setEmployeeFilter(event.target.value)
              }
              className={inputClassName}
            >
              <option value="all">All technicians</option>
              <option value="unassigned">
                Unassigned only
              </option>

              {employees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {employee.full_name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <p className="mt-4 text-sm font-bold text-gray-500">
          Showing {formatDate(startDate)} through{" "}
          {formatDate(endDate)}
        </p>
      </section>

      {groupedJobs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <h2 className="text-xl font-black text-gray-900">
            No scheduled work orders found
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            Change the date range or generate jobs from recurring
            services.
          </p>

          <Link
            href="/recurring"
            className="mt-5 inline-flex rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white"
          >
            Open Recurring Services
          </Link>
        </section>
      ) : (
        <section className="space-y-6">
          {groupedJobs.map(([date, dateJobs]) => (
            <section
              key={date}
              className="overflow-hidden rounded-2xl border bg-white shadow-sm"
            >
              <header className="border-b bg-gray-50 px-5 py-4">
                <h2 className="text-xl font-black text-gray-950">
                  {formatDate(date)}
                </h2>

                <p className="mt-1 text-sm font-bold text-gray-500">
                  {dateJobs.length} work order
                  {dateJobs.length === 1 ? "" : "s"}
                </p>
              </header>

              <div className="divide-y">
                {dateJobs.map((job) => {
                  const property = job.property_id
                    ? propertyMap.get(job.property_id)
                    : null;

                  const client = job.client_id
                    ? clientMap.get(job.client_id)
                    : null;

                  const assignedEmployee =
                    job.assigned_employee_id
                      ? employeeMap.get(
                          job.assigned_employee_id,
                        )
                      : null;

                  const draft = drafts[job.id] ?? {
                    employeeId:
                      job.assigned_employee_id ?? "",
                    date: getDatePart(job.scheduled_start),
                    time: getTimePart(job.scheduled_start),
                  };

                  return (
                    <article
                      key={job.id}
                      className="p-5"
                    >
                      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr_auto] xl:items-end">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/work-orders/${job.id}`}
                              className="text-lg font-black text-gray-950 transition hover:text-bakerssPink"
                            >
                              {job.job_title}
                            </Link>

                            <StatusBadge
                              value={job.job_status}
                            />

                            {job.priority &&
                              job.priority !== "normal" && (
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                                  {formatText(job.priority)}
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

                          <p className="mt-2 text-sm font-bold text-gray-600">
                            Current technician:{" "}
                            {assignedEmployee?.full_name ??
                              "Unassigned"}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Technician">
                            <select
                              value={draft.employeeId}
                              onChange={(event) =>
                                updateDraft(job.id, {
                                  employeeId:
                                    event.target.value,
                                })
                              }
                              className={inputClassName}
                            >
                              <option value="">
                                Unassigned
                              </option>

                              {employees.map((employee) => (
                                <option
                                  key={employee.id}
                                  value={employee.id}
                                >
                                  {employee.full_name}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Date">
                            <input
                              type="date"
                              value={draft.date}
                              onChange={(event) =>
                                updateDraft(job.id, {
                                  date: event.target.value,
                                })
                              }
                              className={inputClassName}
                            />
                          </Field>

                          <Field label="Time">
                            <input
                              type="time"
                              value={draft.time}
                              onChange={(event) =>
                                updateDraft(job.id, {
                                  time: event.target.value,
                                })
                              }
                              className={inputClassName}
                            />
                          </Field>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:flex-col">
                          <button
                            type="button"
                            onClick={() =>
                              void saveJob(job)
                            }
                            disabled={Boolean(savingJobId)}
                            className="rounded-xl bg-bakerssPink px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingJobId === job.id
                              ? "Saving…"
                              : "Save Schedule"}
                          </button>

                          {job.assigned_employee_id && (
                            <button
                              type="button"
                              onClick={() =>
                                void clearAssignment(job)
                              }
                              disabled={Boolean(savingJobId)}
                              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-black text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Unassign
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-black text-gray-500">
        {title}
      </p>

      <p className="mt-2 text-3xl font-black text-gray-950">
        {value}
      </p>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-gray-800">
        {label}
      </span>

      {children}
    </label>
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

const inputClassName =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100";

function getDatePart(value: string | null) {
  if (!value) {
    return getTodayInput();
  }

  return value.slice(0, 10);
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

function getTodayInput() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(now);
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