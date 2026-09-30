"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
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

type Employee = {
  id: string;
  full_name: string;
};

type TimeEntry = {
  id: string;
  employee_id: string | null;
  profile_id: string | null;
  job_id: string | null;
  parent_shift_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
  clock_in_note: string | null;
  clock_out_note: string | null;
  status: "open" | "closed" | "adjusted" | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;

  employees: {
    full_name: string;
  } | null;

  jobs: {
    job_title: string;
  } | null;

  approver: {
    full_name: string | null;
  } | null;
};

type AdjustmentMetadata = {
  reason?: string;
  adjusted_by_name?: string;
  adjusted_at?: string;
  old_clock_in?: string;
  new_clock_in?: string;
  old_clock_out?: string | null;
  new_clock_out?: string | null;
  message?: string;
};

type ActivityEntry = {
  id: string;
  entity_id: string;
  metadata: AdjustmentMetadata | null;
  created_at: string;
};

type StatusFilter =
  | "all"
  | "open"
  | "closed"
  | "adjusted"
  | "approved";

type EditForm = {
  clockIn: string;
  clockOut: string;
  reason: string;
};

const emptyEditForm: EditForm = {
  clockIn: "",
  clockOut: "",
  reason: "",
};

export default function TimeclockManagerPage() {
  const router = useRouter();

  const [currentProfile, setCurrentProfile] =
    useState<Profile | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [adjustments, setAdjustments] = useState<
    Record<string, ActivityEntry>
  >({});

  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return formatDateInput(date);
  });

  const [endDate, setEndDate] = useState(() =>
    formatDateInput(new Date()),
  );

  const [editingEntry, setEditingEntry] =
    useState<TimeEntry | null>(null);
  const [editForm, setEditForm] =
    useState<EditForm>(emptyEditForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] =
    useState(false);
  const [workingEntryId, setWorkingEntryId] = useState("");

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
      setSuccessMessage("");

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
        setErrorMessage(
          `Your manager profile could not be loaded: ${profileError.message}`,
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (!profileData) {
        setErrorMessage("No profile is connected to this login.");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const profile = profileData as Profile;
      const role = profile.role?.toLowerCase() || "";

      if (role !== "admin" && role !== "manager") {
        setErrorMessage(
          "Access denied. Only administrators and managers can review employee time.",
        );
        setCurrentProfile(profile);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setCurrentProfile(profile);

      const startBoundary = new Date(`${startDate}T00:00:00`);
      const endBoundary = new Date(`${endDate}T23:59:59.999`);

      if (
        Number.isNaN(startBoundary.getTime()) ||
        Number.isNaN(endBoundary.getTime())
      ) {
        setErrorMessage("Enter a valid date range.");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (startBoundary > endBoundary) {
        setErrorMessage(
          "The start date cannot be after the end date.",
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      let timeQuery = supabase
        .from("employee_timeclock")
        .select(`
          id,
          employee_id,
          profile_id,
          job_id,
          parent_shift_id,
          entry_type,
          activity_type,
          clock_in_time,
          clock_out_time,
          clock_in_note,
          clock_out_note,
          status,
          approved_by,
          approved_at,
          created_at,
          employees (
            full_name
          ),
          jobs (
            job_title
          ),
          approver:profiles!employee_timeclock_approved_by_fkey (
            full_name
          )
        `)
        .gte("clock_in_time", startBoundary.toISOString())
        .lte("clock_in_time", endBoundary.toISOString())
        .order("clock_in_time", { ascending: false });

      if (employeeFilter) {
        timeQuery = timeQuery.eq(
          "employee_id",
          employeeFilter,
        );
      }

      if (statusFilter === "approved") {
        timeQuery = timeQuery.not("approved_at", "is", null);
      } else if (statusFilter !== "all") {
        timeQuery = timeQuery.eq("status", statusFilter);
      }

      const [employeesResponse, entriesResponse] =
        await Promise.all([
          supabase
            .from("employees")
            .select("id, full_name")
            .order("full_name", { ascending: true }),
          timeQuery,
        ]);

      const firstError =
        employeesResponse.error || entriesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const loadedEntries =
        (entriesResponse.data ?? []) as unknown as TimeEntry[];

      setEmployees(
        (employeesResponse.data ?? []) as Employee[],
      );
      setEntries(loadedEntries);

      if (loadedEntries.length > 0) {
        const entryIds = loadedEntries.map((entry) => entry.id);

        const { data: adjustmentData, error: adjustmentError } =
          await supabase
            .from("activity_log")
            .select("id, entity_id, metadata, created_at")
            .eq("entity_type", "timeclock")
            .eq("action", "time_entry_adjusted")
            .in("entity_id", entryIds)
            .order("created_at", { ascending: false });

        if (adjustmentError) {
          setErrorMessage(
            `Time entries loaded, but adjustment history could not be loaded: ${adjustmentError.message}`,
          );
        } else {
          const latestByEntry: Record<string, ActivityEntry> = {};

          for (const item of adjustmentData ?? []) {
            const typedItem = item as ActivityEntry;

            if (!latestByEntry[typedItem.entity_id]) {
              latestByEntry[typedItem.entity_id] = typedItem;
            }
          }

          setAdjustments(latestByEntry);
        }
      } else {
        setAdjustments({});
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [
      employeeFilter,
      endDate,
      router,
      startDate,
      statusFilter,
    ],
  );

  useEffect(() => {
    void loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) {
          router.replace("/login");
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [loadPage, router]);

  const totals = useMemo(() => {
    let payrollMilliseconds = 0;
    let productionMilliseconds = 0;
    let travelMilliseconds = 0;
    let onsiteMilliseconds = 0;
    let workMilliseconds = 0;
    let openShiftCount = 0;
    let openJobCount = 0;
    let approvedShiftCount = 0;

    for (const entry of entries) {
      if (!entry.clock_out_time) {
        if (entry.entry_type === "shift") {
          openShiftCount += 1;
        } else {
          openJobCount += 1;
        }
      } else {
        const start = new Date(entry.clock_in_time).getTime();
        const end = new Date(entry.clock_out_time).getTime();

        if (
          !Number.isNaN(start) &&
          !Number.isNaN(end) &&
          end >= start
        ) {
          const duration = end - start;

          if (entry.entry_type === "shift") {
            payrollMilliseconds += duration;
          } else {
            productionMilliseconds += duration;

            if (entry.activity_type === "travel") {
              travelMilliseconds += duration;
            } else if (entry.activity_type === "onsite") {
              onsiteMilliseconds += duration;
            } else if (entry.activity_type === "work") {
              workMilliseconds += duration;
            }
          }
        }
      }

      if (
        entry.entry_type === "shift" &&
        entry.approved_at
      ) {
        approvedShiftCount += 1;
      }
    }

    return {
      payrollHours: payrollMilliseconds / 3_600_000,
      productionHours:
        productionMilliseconds / 3_600_000,
      travelHours: travelMilliseconds / 3_600_000,
      onsiteHours: onsiteMilliseconds / 3_600_000,
      workHours: workMilliseconds / 3_600_000,
      openShiftCount,
      openJobCount,
      approvedShiftCount,
    };
  }, [entries]);

  async function approveEntry(entry: TimeEntry) {
    if (!currentProfile || workingEntryId) {
      return;
    }

    if (!entry.clock_out_time) {
      setErrorMessage(
        "An open time entry cannot be approved.",
      );
      return;
    }

    setWorkingEntryId(entry.id);
    setErrorMessage("");
    setSuccessMessage("");

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("employee_timeclock")
      .update({
        approved_by: currentProfile.id,
        approved_at: now,
      })
      .eq("id", entry.id);

    if (error) {
      setErrorMessage(error.message);
      setWorkingEntryId("");
      return;
    }

    setSuccessMessage(
      `${entry.employees?.full_name || "Employee"} time entry approved.`,
    );
    setWorkingEntryId("");
    await loadPage(true);
  }

  async function removeApproval(entry: TimeEntry) {
    if (workingEntryId) {
      return;
    }

    setWorkingEntryId(entry.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("employee_timeclock")
      .update({
        approved_by: null,
        approved_at: null,
      })
      .eq("id", entry.id);

    if (error) {
      setErrorMessage(error.message);
      setWorkingEntryId("");
      return;
    }

    setSuccessMessage("Approval removed.");
    setWorkingEntryId("");
    await loadPage(true);
  }

  function openAdjustment(entry: TimeEntry) {
    setEditingEntry(entry);
    setEditForm({
      clockIn: formatDateForInput(entry.clock_in_time),
      clockOut: formatDateForInput(entry.clock_out_time),
      reason: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function closeAdjustment() {
    if (isSavingAdjustment) {
      return;
    }

    setEditingEntry(null);
    setEditForm(emptyEditForm);
  }

  async function saveAdjustment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !editingEntry ||
      !currentProfile ||
      isSavingAdjustment
    ) {
      return;
    }

    const reason = editForm.reason.trim();

    if (!reason) {
      setErrorMessage(
        "Enter a reason for the time adjustment.",
      );
      return;
    }

    if (!editForm.clockIn) {
      setErrorMessage("Clock-in time is required.");
      return;
    }

    const newClockInDate = new Date(editForm.clockIn);
    const newClockOutDate = editForm.clockOut
      ? new Date(editForm.clockOut)
      : null;

    if (Number.isNaN(newClockInDate.getTime())) {
      setErrorMessage("Enter a valid clock-in time.");
      return;
    }

    if (
      newClockOutDate &&
      Number.isNaN(newClockOutDate.getTime())
    ) {
      setErrorMessage("Enter a valid clock-out time.");
      return;
    }

    if (
      newClockOutDate &&
      newClockOutDate <= newClockInDate
    ) {
      setErrorMessage(
        "Clock-out time must be after clock-in time.",
      );
      return;
    }

    if (!editingEntry.employee_id) {
      setErrorMessage(
        "This entry is not connected to an employee.",
      );
      return;
    }

    setIsSavingAdjustment(true);
    setErrorMessage("");
    setSuccessMessage("");

    const proposedClockIn = newClockInDate.toISOString();
    const proposedClockOut =
      newClockOutDate?.toISOString() ?? null;

    let overlapQuery = supabase
      .from("employee_timeclock")
      .select(
        "id, clock_in_time, clock_out_time, status, entry_type",
      )
      .eq("employee_id", editingEntry.employee_id)
      .eq("entry_type", editingEntry.entry_type)
      .neq("id", editingEntry.id)
      .lt(
        "clock_in_time",
        proposedClockOut ??
          "9999-12-31T23:59:59.999Z",
      );

    if (proposedClockIn) {
      overlapQuery = overlapQuery.or(
        `clock_out_time.is.null,clock_out_time.gt.${proposedClockIn}`,
      );
    }

    const { data: overlaps, error: overlapError } =
      await overlapQuery;

    if (overlapError) {
      setErrorMessage(
        `The system could not verify overlapping time entries: ${overlapError.message}`,
      );
      setIsSavingAdjustment(false);
      return;
    }

    if ((overlaps ?? []).length > 0) {
      setErrorMessage(
        "This adjustment overlaps another time entry for the same employee.",
      );
      setIsSavingAdjustment(false);
      return;
    }

    const nextStatus = proposedClockOut
      ? "adjusted"
      : "open";

    const { error: updateError } = await supabase
      .from("employee_timeclock")
      .update({
        clock_in_time: proposedClockIn,
        clock_out_time: proposedClockOut,
        status: nextStatus,
        approved_by: null,
        approved_at: null,
      })
      .eq("id", editingEntry.id);

    if (updateError) {
      setErrorMessage(updateError.message);
      setIsSavingAdjustment(false);
      return;
    }

    const adjustedAt = new Date().toISOString();
    const adjustedByName =
      currentProfile.full_name || "Administrator";

    const { error: activityError } = await supabase
      .from("activity_log")
      .insert({
        actor_profile_id: currentProfile.id,
        action: "time_entry_adjusted",
        activity_type: "time_entry_adjusted",
        entity_type: "timeclock",
        entity_id: editingEntry.id,
        metadata: {
          reason,
          adjusted_by_name: adjustedByName,
          adjusted_at: adjustedAt,
          old_clock_in: editingEntry.clock_in_time,
          new_clock_in: proposedClockIn,
          old_clock_out: editingEntry.clock_out_time,
          new_clock_out: proposedClockOut,
          employee_id: editingEntry.employee_id,
          job_id: editingEntry.job_id,
          message: `Time entry adjusted by ${adjustedByName}. Reason: ${reason}`,
        },
      });

    if (activityError) {
      setErrorMessage(
        `Time entry was adjusted, but the audit record failed: ${activityError.message}`,
      );
      setEditingEntry(null);
      setEditForm(emptyEditForm);
      setIsSavingAdjustment(false);
      await loadPage(true);
      return;
    }

    setSuccessMessage(
      "Time entry adjusted. Previous approval was removed and reapproval is required.",
    );
    setEditingEntry(null);
    setEditForm(emptyEditForm);
    setIsSavingAdjustment(false);
    await loadPage(true);
  }

  function formatDateTime(value: string | null) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Invalid date";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function getDuration(entry: TimeEntry) {
    if (!entry.clock_out_time) {
      return "Open";
    }

    const start = new Date(
      entry.clock_in_time,
    ).getTime();
    const end = new Date(
      entry.clock_out_time,
    ).getTime();

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      end < start
    ) {
      return "Invalid";
    }

    const totalMinutes = Math.round(
      (end - start) / 60_000,
    );
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
  }

  function formatHours(hours: number) {
    return `${hours.toFixed(2)} hrs`;
  }

  function getStatusClasses(entry: TimeEntry) {
    if (!entry.clock_out_time || entry.status === "open") {
      return "bg-blue-50 text-blue-700";
    }

    if (entry.status === "adjusted") {
      return "bg-amber-50 text-amber-700";
    }

    return "bg-green-50 text-green-700";
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">
          Loading employee timeclock...
        </p>
      </div>
    );
  }

  const hasManagerAccess =
    currentProfile &&
    ["admin", "manager"].includes(
      currentProfile.role?.toLowerCase() || "",
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Management
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Employee Timeclock
          </h1>

          <p className="mt-2 text-gray-600">
            Review, approve, and correct employee time
            entries.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/timeclock/payroll"
            className="rounded-xl bg-bakerssPink px-5 py-3 text-center text-sm font-black text-white transition hover:opacity-90"
          >
            Weekly Payroll Summary
          </Link>

          <button
            type="button"
            onClick={() => void loadPage(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
          >
            Sign Out
          </button>
        </div>
      </div>

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

      {hasManagerAccess && (
        <>
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-black">
                  Employee
                </label>

                <select
                  value={employeeFilter}
                  onChange={(event) =>
                    setEmployeeFilter(event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                >
                  <option value="">All employees</option>

                  {employees.map((employeeItem) => (
                    <option
                      key={employeeItem.id}
                      value={employeeItem.id}
                    >
                      {employeeItem.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Status
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as StatusFilter,
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                >
                  <option value="all">All entries</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="adjusted">Adjusted</option>
                  <option value="approved">Approved</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Start Date
                </label>

                <input
                  type="date"
                  value={startDate}
                  onChange={(event) =>
                    setStartDate(event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  End Date
                </label>

                <input
                  type="date"
                  value={endDate}
                  onChange={(event) =>
                    setEndDate(event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Payroll Hours"
              value={formatHours(totals.payrollHours)}
              note="Closed daily shift entries only"
            />

            <SummaryCard
              title="Production Hours"
              value={formatHours(totals.productionHours)}
              note="Travel, onsite, and work time"
            />

            <SummaryCard
              title="Employees Clocked In"
              value={String(totals.openShiftCount)}
              note="Open daily payroll shifts"
            />

            <SummaryCard
              title="Active Job Timers"
              value={String(totals.openJobCount)}
              note="Open production timers"
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Travel Time"
              value={formatHours(totals.travelHours)}
              note="Job-related travel entries"
            />

            <SummaryCard
              title="Onsite Time"
              value={formatHours(totals.onsiteHours)}
              note="Arrival and onsite entries"
            />

            <SummaryCard
              title="Work Time"
              value={formatHours(totals.workHours)}
              note="Active production work"
            />

            <SummaryCard
              title="Approved Shifts"
              value={String(totals.approvedShiftCount)}
              note="Payroll shifts approved by management"
            />
          </section>

          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="text-xl font-black">
                Time Entries
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {entries.length} record
                {entries.length === 1 ? "" : "s"} found
              </p>
            </div>

            {entries.length === 0 ? (
              <div className="p-10 text-center">
                <h3 className="text-lg font-black">
                  No time entries found
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  Adjust the employee, status, or date
                  filters.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {entries.map((entry) => {
                  const adjustment =
                    adjustments[entry.id]?.metadata;

                  return (
                    <article
                      key={entry.id}
                      className="p-5"
                    >
                      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black">
                              {entry.employees?.full_name ||
                                "Unknown employee"}
                            </h3>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getStatusClasses(
                                entry,
                              )}`}
                            >
                              {entry.status ||
                                (entry.clock_out_time
                                  ? "closed"
                                  : "open")}
                            </span>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                                entry.entry_type === "shift"
                                  ? "bg-gray-950 text-white"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {entry.entry_type === "shift"
                                ? "Payroll Shift"
                                : `${formatEntryLabel(
                                    entry.activity_type,
                                  )} Time`}
                            </span>

                            {entry.approved_at && (
                              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                                Approved
                              </span>
                            )}

                            {entry.status === "adjusted" &&
                              !entry.approved_at && (
                                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                                  Reapproval Required
                                </span>
                              )}
                          </div>

                          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <InfoBlock
                              label="Clock In"
                              value={formatDateTime(
                                entry.clock_in_time,
                              )}
                            />

                            <InfoBlock
                              label="Clock Out"
                              value={formatDateTime(
                                entry.clock_out_time,
                              )}
                            />

                            <InfoBlock
                              label="Duration"
                              value={getDuration(entry)}
                            />

                            <InfoBlock
                              label={
                                entry.entry_type === "shift"
                                  ? "Entry Type"
                                  : "Work Order"
                              }
                              value={
                                entry.entry_type === "shift"
                                  ? "Daily payroll shift"
                                  : entry.jobs?.job_title ||
                                    "Unknown work order"
                              }
                            />
                          </div>

                          {(entry.clock_in_note ||
                            entry.clock_out_note) && (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {entry.clock_in_note && (
                                <NoteBlock
                                  label="Clock-In Note"
                                  value={entry.clock_in_note}
                                />
                              )}

                              {entry.clock_out_note && (
                                <NoteBlock
                                  label="Clock-Out Note"
                                  value={entry.clock_out_note}
                                />
                              )}
                            </div>
                          )}

                          {adjustment && (
                            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                              <p className="text-xs font-black uppercase tracking-wide text-amber-800">
                                Latest Adjustment
                              </p>

                              <p className="mt-2 text-sm font-bold text-amber-900">
                                {adjustment.reason ||
                                  "No reason recorded"}
                              </p>

                              <p className="mt-2 text-xs font-bold text-amber-700">
                                Adjusted by{" "}
                                {adjustment.adjusted_by_name ||
                                  "Administrator"}
                                {adjustment.adjusted_at
                                  ? ` on ${formatDateTime(
                                      adjustment.adjusted_at,
                                    )}`
                                  : ""}
                              </p>

                              <div className="mt-3 grid gap-2 text-xs text-amber-800 md:grid-cols-2">
                                <p>
                                  Previous:{" "}
                                  {formatDateTime(
                                    adjustment.old_clock_in ||
                                      null,
                                  )}{" "}
                                  →{" "}
                                  {formatDateTime(
                                    adjustment.old_clock_out ||
                                      null,
                                  )}
                                </p>

                                <p>
                                  Updated:{" "}
                                  {formatDateTime(
                                    adjustment.new_clock_in ||
                                      null,
                                  )}{" "}
                                  →{" "}
                                  {formatDateTime(
                                    adjustment.new_clock_out ||
                                      null,
                                  )}
                                </p>
                              </div>
                            </div>
                          )}

                          {entry.approved_at && (
                            <p className="mt-4 text-xs font-bold text-gray-500">
                              Approved{" "}
                              {formatDateTime(entry.approved_at)}
                              {entry.approver?.full_name
                                ? ` by ${entry.approver.full_name}`
                                : ""}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
                          {entry.job_id && (
                            <Link
                              href={`/work-orders/${entry.job_id}`}
                              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
                            >
                              View Work Order
                            </Link>
                          )}

                          <button
                            type="button"
                            disabled={
                              workingEntryId === entry.id
                            }
                            onClick={() =>
                              openAdjustment(entry)
                            }
                            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                          >
                            Adjust Time
                          </button>

                          {!entry.approved_at ? (
                            <button
                              type="button"
                              disabled={
                                !entry.clock_out_time ||
                                workingEntryId === entry.id
                              }
                              onClick={() =>
                                void approveEntry(entry)
                              }
                              className="rounded-xl bg-bakerssPink px-4 py-2 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {workingEntryId === entry.id
                                ? "Approving..."
                                : "Approve"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={
                                workingEntryId === entry.id
                              }
                              onClick={() =>
                                void removeApproval(entry)
                              }
                              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              {workingEntryId === entry.id
                                ? "Updating..."
                                : "Remove Approval"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
                  Administrator Adjustment
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Correct Time Entry
                </h2>

                <p className="mt-2 text-sm text-gray-600">
                  {editingEntry.employees?.full_name ||
                    "Employee"}
                  {editingEntry.jobs?.job_title
                    ? ` — ${editingEntry.jobs.job_title}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdjustment}
                className="rounded-lg border px-3 py-2 text-sm font-black"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={saveAdjustment}
              className="mt-6 space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm font-black">
                  Clock-In Time
                </label>

                <input
                  type="datetime-local"
                  value={editForm.clockIn}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      clockIn: event.target.value,
                    }))
                  }
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Clock-Out Time
                </label>

                <input
                  type="datetime-local"
                  value={editForm.clockOut}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      clockOut: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />

                <p className="mt-2 text-xs text-gray-500">
                  Leave blank only when the employee should
                  remain clocked in.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Adjustment Reason
                </label>

                <textarea
                  value={editForm.reason}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  rows={4}
                  required
                  placeholder="Example: Employee forgot to clock out at the end of the job."
                  className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                  {errorMessage}
                </div>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Saving an adjustment removes the existing
                approval. The corrected entry must be approved
                again.
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeAdjustment}
                  disabled={isSavingAdjustment}
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-black"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingAdjustment}
                  className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingAdjustment
                    ? "Saving Adjustment..."
                    : "Save Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
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

function formatDateForInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(
    date.getTime() - offset * 60 * 1000,
  );

  return localDate.toISOString().slice(0, 16);
}

function formatEntryLabel(value: string | null) {
  if (!value) {
    return "Job";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function SummaryCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
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

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-bold text-gray-900">
        {value}
      </p>
    </div>
  );
}

function NoteBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
        {value}
      </p>
    </div>
  );
}
