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
  employment_status: string | null;
  hourly_rate: number | null;
};

type TimeEntry = {
  id: string;
  employee_id: string | null;
  job_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
};

type TechnicianRow = {
  employee: Employee;
  payrollHours: number;
  travelHours: number;
  onsiteHours: number;
  workHours: number;
  productionHours: number;
  untrackedHours: number;
  utilizationPercent: number | null;
  travelPercent: number | null;
  completedJobCount: number;
  estimatedLaborCost: number;
};

export default function TechnicianPerformanceReportPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [completedJobsByEmployee, setCompletedJobsByEmployee] =
    useState<Map<string, number>>(new Map());

  const [startDate, setStartDate] = useState(
    getMonthStartInput(),
  );
  const [endDate, setEndDate] = useState(getTodayInput());
  const [employeeFilter, setEmployeeFilter] =
    useState("all");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadReport = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const rangeStart = new Date(
        `${startDate}T00:00:00`,
      ).toISOString();

      const rangeEnd = new Date(
        `${addDaysToInput(endDate, 1)}T00:00:00`,
      ).toISOString();

      const [
        employeeResponse,
        timeResponse,
        jobsResponse,
      ] = await Promise.all([
        supabase
          .from("employees")
          .select(`
            id,
            full_name,
            employment_status,
            hourly_rate
          `)
          .order("full_name", { ascending: true }),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            employee_id,
            job_id,
            entry_type,
            activity_type,
            clock_in_time,
            clock_out_time
          `)
          .gte("clock_in_time", rangeStart)
          .lt("clock_in_time", rangeEnd),

        supabase
          .from("jobs")
          .select("id, assigned_employee_id, job_status")
          .gte("scheduled_start", rangeStart)
          .lt("scheduled_start", rangeEnd)
          .in("job_status", [
            "completed",
            "complete",
            "closed",
            "invoiced",
          ]),
      ]);

      const firstError =
        employeeResponse.error ||
        timeResponse.error ||
        jobsResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setEmployees(
        (employeeResponse.data ?? []) as Employee[],
      );

      setEntries((timeResponse.data ?? []) as TimeEntry[]);

      const completedMap = new Map<string, number>();

      for (const job of jobsResponse.data ?? []) {
        const employeeId =
          job.assigned_employee_id as string | null;

        if (!employeeId) {
          continue;
        }

        completedMap.set(
          employeeId,
          (completedMap.get(employeeId) ?? 0) + 1,
        );
      }

      setCompletedJobsByEmployee(completedMap);
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [endDate, startDate],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const rows = useMemo<TechnicianRow[]>(() => {
    return employees.map((employee) => {
      const employeeEntries = entries.filter(
        (entry) => entry.employee_id === employee.id,
      );

      let payrollHours = 0;
      let travelHours = 0;
      let onsiteHours = 0;
      let workHours = 0;

      for (const entry of employeeEntries) {
        const hours = calculateEntryHours(entry);

        if (entry.entry_type === "shift") {
          payrollHours += hours;
          continue;
        }

        if (entry.activity_type === "travel") {
          travelHours += hours;
        } else if (entry.activity_type === "onsite") {
          onsiteHours += hours;
        } else if (entry.activity_type === "work") {
          workHours += hours;
        }
      }

      const productionHours =
        travelHours + onsiteHours + workHours;

      const untrackedHours = Math.max(
        payrollHours - productionHours,
        0,
      );

      const utilizationPercent =
        payrollHours > 0
          ? (productionHours / payrollHours) * 100
          : null;

      const travelPercent =
        productionHours > 0
          ? (travelHours / productionHours) * 100
          : null;

      return {
        employee,
        payrollHours,
        travelHours,
        onsiteHours,
        workHours,
        productionHours,
        untrackedHours,
        utilizationPercent,
        travelPercent,
        completedJobCount:
          completedJobsByEmployee.get(employee.id) ?? 0,
        estimatedLaborCost:
          payrollHours * (employee.hourly_rate ?? 0),
      };
    });
  }, [completedJobsByEmployee, employees, entries]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          employeeFilter === "all" ||
          row.employee.id === employeeFilter,
      ),
    [employeeFilter, rows],
  );

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (result, row) => {
          result.payrollHours += row.payrollHours;
          result.productionHours += row.productionHours;
          result.travelHours += row.travelHours;
          result.workHours += row.workHours;
          result.untrackedHours += row.untrackedHours;
          result.completedJobs += row.completedJobCount;
          result.laborCost += row.estimatedLaborCost;

          return result;
        },
        {
          payrollHours: 0,
          productionHours: 0,
          travelHours: 0,
          workHours: 0,
          untrackedHours: 0,
          completedJobs: 0,
          laborCost: 0,
        },
      ),
    [filteredRows],
  );

  const overallUtilization =
    totals.payrollHours > 0
      ? (totals.productionHours / totals.payrollHours) *
        100
      : null;

  function exportCsv() {
    const headers = [
      "Employee",
      "Payroll Hours",
      "Travel Hours",
      "Onsite Hours",
      "Work Hours",
      "Production Hours",
      "Untracked Hours",
      "Utilization Percent",
      "Travel Percent",
      "Completed Jobs",
      "Estimated Labor Cost",
    ];

    const csvRows = filteredRows.map((row) => [
      row.employee.full_name,
      row.payrollHours.toFixed(2),
      row.travelHours.toFixed(2),
      row.onsiteHours.toFixed(2),
      row.workHours.toFixed(2),
      row.productionHours.toFixed(2),
      row.untrackedHours.toFixed(2),
      row.utilizationPercent === null
        ? ""
        : row.utilizationPercent.toFixed(1),
      row.travelPercent === null
        ? ""
        : row.travelPercent.toFixed(1),
      row.completedJobCount,
      row.estimatedLaborCost.toFixed(2),
    ]);

    const csv = [headers, ...csvRows]
      .map((row) =>
        row
          .map((value) =>
            escapeCsvValue(String(value)),
          )
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `technician-performance-${startDate}-through-${endDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Technician Performance
        </h1>

        <p className="text-gray-600">
          Loading technician metrics…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Reports
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Technician Performance
          </h1>

          <p className="mt-2 text-gray-600">
            Compare payroll hours, production utilization,
            travel, completed work, and estimated labor cost.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reports"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Profitability Report
          </Link>

          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => void loadReport(true)}
            disabled={isRefreshing}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
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

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className="mb-2 block text-sm font-black">
              Start Date
            </span>

            <input
              type="date"
              value={startDate}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              End Date
            </span>

            <input
              type="date"
              value={endDate}
              onChange={(event) =>
                setEndDate(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Employee
            </span>

            <select
              value={employeeFilter}
              onChange={(event) =>
                setEmployeeFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All employees</option>

              {employees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          title="Payroll Hours"
          value={formatHours(totals.payrollHours)}
          note="Closed daily shifts"
        />

        <SummaryCard
          title="Production Hours"
          value={formatHours(totals.productionHours)}
          note="Travel, onsite, and work"
        />

        <SummaryCard
          title="Utilization"
          value={
            overallUtilization === null
              ? "—"
              : `${overallUtilization.toFixed(1)}%`
          }
          note="Production divided by payroll"
          warning={
            overallUtilization !== null &&
            overallUtilization < 70
          }
        />

        <SummaryCard
          title="Travel Hours"
          value={formatHours(totals.travelHours)}
          note="Job-related travel"
        />

        <SummaryCard
          title="Completed Jobs"
          value={String(totals.completedJobs)}
          note="Completed in selected range"
        />

        <SummaryCard
          title="Estimated Labor"
          value={formatCurrency(totals.laborCost)}
          note="Payroll hours × hourly rate"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Employee Detail
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Employee",
                  "Payroll",
                  "Travel",
                  "Onsite",
                  "Work",
                  "Production",
                  "Untracked",
                  "Utilization",
                  "Travel %",
                  "Completed Jobs",
                  "Labor Cost",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => (
                <tr
                  key={row.employee.id}
                  className="hover:bg-gray-50"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/employees/${row.employee.id}`}
                      className="font-black text-gray-950 hover:text-bakerssPink"
                    >
                      {row.employee.full_name}
                    </Link>
                  </td>

                  <NumberCell
                    value={row.payrollHours}
                  />
                  <NumberCell
                    value={row.travelHours}
                  />
                  <NumberCell
                    value={row.onsiteHours}
                  />
                  <NumberCell
                    value={row.workHours}
                  />
                  <NumberCell
                    value={row.productionHours}
                  />
                  <NumberCell
                    value={row.untrackedHours}
                    warning={row.untrackedHours > 2}
                  />

                  <td className="px-5 py-4">
                    <PercentBadge
                      value={row.utilizationPercent}
                      healthyMinimum={70}
                    />
                  </td>

                  <td className="px-5 py-4">
                    <PercentBadge
                      value={row.travelPercent}
                      healthyMaximum={35}
                    />
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.completedJobCount}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(
                      row.estimatedLaborCost,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-black text-blue-950">
          Metric Definitions
        </h2>

        <p className="mt-2 text-sm leading-6 text-blue-900">
          Utilization equals closed production time divided by
          closed payroll-shift time. Untracked hours represent
          payroll time without a corresponding travel, onsite,
          or work timer. Open timers are excluded.
        </p>
      </section>
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

      <p className="mt-2 text-2xl font-black text-gray-950">
        {value}
      </p>

      <p className="mt-2 text-xs font-bold text-gray-500">
        {note}
      </p>
    </section>
  );
}

function NumberCell({
  value,
  warning = false,
}: {
  value: number;
  warning?: boolean;
}) {
  return (
    <td
      className={`px-5 py-4 text-sm font-black ${
        warning ? "text-amber-700" : "text-gray-900"
      }`}
    >
      {value.toFixed(2)}
    </td>
  );
}

function PercentBadge({
  value,
  healthyMinimum,
  healthyMaximum,
}: {
  value: number | null;
  healthyMinimum?: number;
  healthyMaximum?: number;
}) {
  if (value === null) {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">
        —
      </span>
    );
  }

  const healthy =
    healthyMinimum !== undefined
      ? value >= healthyMinimum
      : healthyMaximum !== undefined
        ? value <= healthyMaximum
        : true;

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${
        healthy
          ? "bg-green-100 text-green-800"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {value.toFixed(1)}%
    </span>
  );
}

function calculateEntryHours(entry: TimeEntry) {
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

function getMonthStartInput() {
  const now = new Date();

  return formatDateInput(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
}

function getTodayInput() {
  const now = new Date();

  return formatDateInput(
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ),
  );
}

function addDaysToInput(
  value: string,
  days: number,
) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);

  return formatDateInput(date);
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

function formatHours(value: number) {
  return `${value.toFixed(2)} hrs`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
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