"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  employment_status: string | null;
  hourly_rate: number | null;
  pay_type: string | null;
};

type TimeEntry = {
  id: string;
  employee_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
  approved_at: string | null;
  status: string | null;
};

type PayrollPeriod = {
  id: string;
  week_start: string;
  week_end: string;
  status: "draft" | "finalized";
  finalized_by: string | null;
  finalized_at: string | null;
  notes: string | null;
};

type EmployeeSummary = {
  employee: Employee;
  payrollHours: number;
  regularHours: number;
  overtimeHours: number;
  productionHours: number;
  travelHours: number;
  onsiteHours: number;
  workHours: number;
  approvedShiftHours: number;
  unapprovedShiftHours: number;
  openShiftCount: number;
  utilizationPercent: number | null;
  estimatedGrossPay: number | null;
};

export default function WeeklyPayrollSummaryPage() {
  const router = useRouter();

  const [currentProfile, setCurrentProfile] =
    useState<Profile | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [payrollPeriod, setPayrollPeriod] =
    useState<PayrollPeriod | null>(null);
  const [isUpdatingPeriod, setIsUpdatingPeriod] =
    useState(false);

  const [weekStart, setWeekStart] = useState(
    getCurrentSundayInput(),
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const weekEnd = useMemo(
    () => addDaysToDateInput(weekStart, 6),
    [weekStart],
  );

  const loadPage = useCallback(
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

      const profile = profileData as Profile;
      const role = profile.role?.toLowerCase() ?? "";

      if (!["admin", "manager"].includes(role)) {
        setCurrentProfile(profile);
        setErrorMessage(
          "Access denied. Only administrators and managers can review payroll summaries.",
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setCurrentProfile(profile);

      const rangeStart = localDateStartToIso(weekStart);
      const rangeEnd = localDateStartToIso(
        addDaysToDateInput(weekEnd, 1),
      );

      const [
        employeesResponse,
        entriesResponse,
        payrollPeriodResponse,
      ] = await Promise.all([
          supabase
            .from("employees")
            .select(`
              id,
              full_name,
              employment_status,
              hourly_rate,
              pay_type
            `)
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
              approved_at,
              status
            `)
            .gte("clock_in_time", rangeStart)
            .lt("clock_in_time", rangeEnd)
            .order("clock_in_time", { ascending: true }),

          supabase
            .from("payroll_periods")
            .select(`
              id,
              week_start,
              week_end,
              status,
              finalized_by,
              finalized_at,
              notes
            `)
            .eq("week_start", weekStart)
            .maybeSingle(),
        ]);

      const firstError =
        employeesResponse.error ||
        entriesResponse.error ||
        payrollPeriodResponse.error;

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

      setPayrollPeriod(
        (payrollPeriodResponse.data as PayrollPeriod | null) ??
          null,
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [router, weekEnd, weekStart],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const summaries = useMemo<EmployeeSummary[]>(() => {
    return employees.map((employee) => {
      const employeeEntries = entries.filter(
        (entry) => entry.employee_id === employee.id,
      );

      let payrollHours = 0;
      let productionHours = 0;
      let travelHours = 0;
      let onsiteHours = 0;
      let workHours = 0;
      let approvedShiftHours = 0;
      let unapprovedShiftHours = 0;
      let openShiftCount = 0;

      for (const entry of employeeEntries) {
        if (
          entry.entry_type === "shift" &&
          !entry.clock_out_time
        ) {
          openShiftCount += 1;
          continue;
        }

        if (!entry.clock_out_time) {
          continue;
        }

        const durationHours = calculateHours(entry);

        if (entry.entry_type === "shift") {
          payrollHours += durationHours;

          if (entry.approved_at) {
            approvedShiftHours += durationHours;
          } else {
            unapprovedShiftHours += durationHours;
          }
        } else {
          productionHours += durationHours;

          if (entry.activity_type === "travel") {
            travelHours += durationHours;
          } else if (entry.activity_type === "onsite") {
            onsiteHours += durationHours;
          } else if (entry.activity_type === "work") {
            workHours += durationHours;
          }
        }
      }

      const regularHours = Math.min(payrollHours, 40);
      const overtimeHours = Math.max(payrollHours - 40, 0);

      const utilizationPercent =
        payrollHours > 0
          ? Math.min(
              (productionHours / payrollHours) * 100,
              999,
            )
          : null;

      const estimatedGrossPay =
        employee.pay_type === "hourly" &&
        employee.hourly_rate !== null
          ? regularHours * employee.hourly_rate +
            overtimeHours * employee.hourly_rate * 1.5
          : null;

      return {
        employee,
        payrollHours,
        regularHours,
        overtimeHours,
        productionHours,
        travelHours,
        onsiteHours,
        workHours,
        approvedShiftHours,
        unapprovedShiftHours,
        openShiftCount,
        utilizationPercent,
        estimatedGrossPay,
      };
    });
  }, [employees, entries]);

  const totals = useMemo(() => {
    return summaries.reduce(
      (result, summary) => {
        result.payrollHours += summary.payrollHours;
        result.overtimeHours += summary.overtimeHours;
        result.productionHours += summary.productionHours;
        result.unapprovedHours +=
          summary.unapprovedShiftHours;
        result.openShiftCount += summary.openShiftCount;

        if (summary.estimatedGrossPay !== null) {
          result.estimatedGrossPay +=
            summary.estimatedGrossPay;
        }

        return result;
      },
      {
        payrollHours: 0,
        overtimeHours: 0,
        productionHours: 0,
        unapprovedHours: 0,
        openShiftCount: 0,
        estimatedGrossPay: 0,
      },
    );
  }, [summaries]);


  async function finalizePayrollPeriod() {
    if (
      !currentProfile ||
      isUpdatingPeriod ||
      totals.openShiftCount > 0 ||
      totals.unapprovedHours > 0
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Finalize payroll for ${formatDate(
        weekStart,
      )} through ${formatDate(
        weekEnd,
      )}?`,
    );

    if (!confirmed) return;

    setIsUpdatingPeriod(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("payroll_periods")
      .upsert(
        {
          week_start: weekStart,
          week_end: weekEnd,
          status: "finalized",
          finalized_by: currentProfile.id,
          finalized_at: new Date().toISOString(),
        },
        { onConflict: "week_start" },
      )
      .select("*")
      .single();

    if (error) {
      setErrorMessage(error.message);
    } else {
      setPayrollPeriod(data as PayrollPeriod);
    }

    setIsUpdatingPeriod(false);
  }

  async function reopenPayrollPeriod() {
    if (!payrollPeriod || isUpdatingPeriod) return;

    if (!window.confirm("Reopen this payroll period for corrections?")) {
      return;
    }

    setIsUpdatingPeriod(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("payroll_periods")
      .update({
        status: "draft",
        finalized_by: null,
        finalized_at: null,
      })
      .eq("id", payrollPeriod.id)
      .select("*")
      .single();

    if (error) {
      setErrorMessage(error.message);
    } else {
      setPayrollPeriod(data as PayrollPeriod);
    }

    setIsUpdatingPeriod(false);
  }

  function exportPayrollCsv() {
    const headers = [
      "Employee",
      "Pay Type",
      "Hourly Rate",
      "Regular Hours",
      "Overtime Hours",
      "Approved Hours",
      "Unapproved Hours",
      "Travel Hours",
      "Onsite Hours",
      "Work Hours",
      "Production Hours",
      "Utilization Percent",
      "Estimated Gross Pay",
      "Open Shifts",
      "Period Status",
    ];

    const rows = summaries.map((summary) => [
      summary.employee.full_name,
      summary.employee.pay_type ?? "",
      summary.employee.hourly_rate ?? "",
      summary.regularHours.toFixed(2),
      summary.overtimeHours.toFixed(2),
      summary.approvedShiftHours.toFixed(2),
      summary.unapprovedShiftHours.toFixed(2),
      summary.travelHours.toFixed(2),
      summary.onsiteHours.toFixed(2),
      summary.workHours.toFixed(2),
      summary.productionHours.toFixed(2),
      summary.utilizationPercent === null
        ? ""
        : summary.utilizationPercent.toFixed(1),
      summary.estimatedGrossPay === null
        ? ""
        : summary.estimatedGrossPay.toFixed(2),
      summary.openShiftCount,
      payrollPeriod?.status ?? "draft",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => escapeCsvValue(String(value))).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `payroll-${weekStart}-through-${weekEnd}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function moveWeek(days: number) {
    setWeekStart((current) =>
      addDaysToDateInput(current, days),
    );
  }

  function handleWeekSelection(value: string) {
    setWeekStart(getSundayForDateInput(value));
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Weekly Payroll Summary
        </h1>

        <p className="text-gray-600">
          Loading payroll totals…
        </p>
      </main>
    );
  }

  const hasManagerAccess =
    currentProfile &&
    ["admin", "manager"].includes(
      currentProfile.role?.toLowerCase() ?? "",
    );

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Payroll
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Weekly Payroll Summary
          </h1>

          <p className="mt-2 text-gray-600">
            Sunday through Saturday payroll hours, estimated
            overtime, approvals, and production utilization.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportPayrollCsv}
            className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white hover:opacity-90 print:hidden"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 print:hidden"
          >
            Print Summary
          </button>

          <button
            type="button"
            onClick={() => void loadPage(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50 print:hidden"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/timeclock"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90 print:hidden"
          >
            Timeclock Manager
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {hasManagerAccess && (
        <>
          <section className="rounded-2xl border bg-white p-5 shadow-sm print:hidden">
            <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto_auto] lg:items-end">
              <button
                type="button"
                onClick={() => moveWeek(-7)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black hover:bg-gray-50"
              >
                Previous Week
              </button>

              <label className="block">
                <span className="mb-2 block text-sm font-black">
                  Select Date
                </span>

                <input
                  type="date"
                  value={weekStart}
                  onChange={(event) =>
                    handleWeekSelection(event.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  setWeekStart(getCurrentSundayInput())
                }
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black hover:bg-gray-50"
              >
                Current Week
              </button>

              <button
                type="button"
                onClick={() => moveWeek(7)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black hover:bg-gray-50"
              >
                Next Week
              </button>
            </div>

            <p className="mt-4 text-sm font-black text-gray-600">
              Pay period: {formatDate(weekStart)} through{" "}
              {formatDate(weekEnd)}
            </p>
          </section>

          <section
            className={`rounded-2xl border p-5 shadow-sm ${
              payrollPeriod?.status === "finalized"
                ? "border-green-200 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Payroll Period Status
                </p>

                <p className="mt-1 text-xl font-black">
                  {payrollPeriod?.status === "finalized"
                    ? "Finalized"
                    : "Draft"}
                </p>

                {payrollPeriod?.finalized_at && (
                  <p className="mt-1 text-sm font-bold text-gray-600">
                    Finalized{" "}
                    {new Date(
                      payrollPeriod.finalized_at,
                    ).toLocaleString()}
                  </p>
                )}

                <p className="mt-2 text-sm text-gray-600">
                  Finalization is available after every shift is
                  closed and approved.
                </p>
              </div>

              {payrollPeriod?.status === "finalized" ? (
                <button
                  type="button"
                  onClick={() => void reopenPayrollPeriod()}
                  disabled={isUpdatingPeriod}
                  className="rounded-xl border border-amber-300 bg-white px-5 py-3 text-sm font-black text-amber-800 hover:bg-amber-50 disabled:opacity-50 print:hidden"
                >
                  {isUpdatingPeriod ? "Updating…" : "Reopen Period"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void finalizePayrollPeriod()}
                  disabled={
                    isUpdatingPeriod ||
                    totals.openShiftCount > 0 ||
                    totals.unapprovedHours > 0
                  }
                  className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
                >
                  {isUpdatingPeriod
                    ? "Finalizing…"
                    : "Finalize Payroll Period"}
                </button>
              )}
            </div>

            {(totals.openShiftCount > 0 ||
              totals.unapprovedHours > 0) &&
              payrollPeriod?.status !== "finalized" && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                  Close all open shifts and approve all payroll
                  hours before finalizing this period.
                </div>
              )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Payroll Hours"
              value={formatHours(totals.payrollHours)}
              note="Closed daily shifts"
            />

            <SummaryCard
              title="Estimated Overtime"
              value={formatHours(totals.overtimeHours)}
              note="Hours above 40 per employee"
              warning={totals.overtimeHours > 0}
            />

            <SummaryCard
              title="Production Hours"
              value={formatHours(totals.productionHours)}
              note="Travel, onsite, and work"
            />

            <SummaryCard
              title="Unapproved Hours"
              value={formatHours(totals.unapprovedHours)}
              note="Closed shifts awaiting approval"
              warning={totals.unapprovedHours > 0}
            />

            <SummaryCard
              title="Open Shifts"
              value={String(totals.openShiftCount)}
              note="Employees still clocked in"
              warning={totals.openShiftCount > 0}
            />
          </section>

          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <header className="border-b px-5 py-4">
              <h2 className="text-xl font-black">
                Employee Payroll Detail
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Estimated gross pay applies only to hourly
                employees with an hourly rate entered.
              </p>
            </header>

            <div className="divide-y">
              {summaries.map((summary) => (
                <article
                  key={summary.employee.id}
                  className="p-5"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/employees/${summary.employee.id}`}
                          className="text-lg font-black text-gray-950 hover:text-bakerssPink"
                        >
                          {summary.employee.full_name}
                        </Link>

                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase text-gray-700">
                          {summary.employee.employment_status ??
                            "unknown"}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-bold text-gray-500">
                        {summary.employee.pay_type === "hourly"
                          ? summary.employee.hourly_rate !== null
                            ? `${formatCurrency(
                                summary.employee.hourly_rate,
                              )} per hour`
                            : "Hourly rate not entered"
                          : summary.employee.pay_type === "salary"
                            ? "Salary employee"
                            : "Pay type not entered"}
                      </p>
                    </div>

                    <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:max-w-5xl">
                      <Metric
                        label="Regular"
                        value={formatHours(
                          summary.regularHours,
                        )}
                      />

                      <Metric
                        label="Overtime"
                        value={formatHours(
                          summary.overtimeHours,
                        )}
                        warning={
                          summary.overtimeHours > 0
                        }
                      />

                      <Metric
                        label="Approved"
                        value={formatHours(
                          summary.approvedShiftHours,
                        )}
                      />

                      <Metric
                        label="Unapproved"
                        value={formatHours(
                          summary.unapprovedShiftHours,
                        )}
                        warning={
                          summary.unapprovedShiftHours > 0
                        }
                      />

                      <Metric
                        label="Travel"
                        value={formatHours(
                          summary.travelHours,
                        )}
                      />

                      <Metric
                        label="Onsite"
                        value={formatHours(
                          summary.onsiteHours,
                        )}
                      />

                      <Metric
                        label="Work"
                        value={formatHours(
                          summary.workHours,
                        )}
                      />

                      <Metric
                        label="Utilization"
                        value={
                          summary.utilizationPercent === null
                            ? "—"
                            : `${summary.utilizationPercent.toFixed(
                                1,
                              )}%`
                        }
                      />
                    </div>

                    <div className="min-w-44 rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                        Estimated Gross
                      </p>

                      <p className="mt-2 text-xl font-black">
                        {summary.estimatedGrossPay === null
                          ? "—"
                          : formatCurrency(
                              summary.estimatedGrossPay,
                            )}
                      </p>

                      {summary.openShiftCount > 0 && (
                        <p className="mt-2 text-xs font-black text-amber-700">
                          {summary.openShiftCount} open shift
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-950">
              Payroll Review Notice
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-900">
              Overtime and gross-pay figures are planning
              estimates. Final payroll must account for your
              actual overtime rules, unpaid breaks, corrections,
              deductions, and payroll-system calculations.
            </p>
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

      <p className="mt-2 text-xs font-bold text-gray-500">
        {note}
      </p>
    </section>
  );
}

function Metric({
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
      className={`rounded-xl border p-3 ${
        warning
          ? "border-amber-200 bg-amber-50"
          : "bg-white"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 font-black text-gray-950">
        {value}
      </p>
    </div>
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
  const localDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  localDate.setDate(
    localDate.getDate() - localDate.getDay(),
  );

  return formatDateInput(localDate);
}

function getSundayForDateInput(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return getCurrentSundayInput();
  }

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

function escapeCsvValue(value: string) {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n")
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}