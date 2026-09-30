"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Job = {
  id: string;
  job_status: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  materials_cost: number | null;
  recurring_service_id: string | null;
};

type TimeEntry = {
  id: string;
  job_id: string | null;
  employee_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
};

type Employee = {
  id: string;
  hourly_rate: number | null;
};

type MonthMetrics = {
  label: string;
  startDate: string;
  endDate: string;
  revenue: number;
  labor: number;
  materials: number;
  totalCost: number;
  grossProfit: number;
  margin: number | null;
  completedJobs: number;
  totalJobs: number;
  recurringRevenue: number;
  productionHours: number;
};

export default function ExecutiveMonthlyReportPage() {
  const [selectedMonth, setSelectedMonth] = useState(
    getCurrentMonthInput(),
  );

  const [currentJobs, setCurrentJobs] = useState<Job[]>([]);
  const [previousJobs, setPreviousJobs] = useState<Job[]>([]);
  const [currentEntries, setCurrentEntries] = useState<
    TimeEntry[]
  >([]);
  const [previousEntries, setPreviousEntries] = useState<
    TimeEntry[]
  >([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

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

      const currentRange = getMonthRange(selectedMonth);
      const previousMonth = shiftMonthInput(
        selectedMonth,
        -1,
      );
      const previousRange = getMonthRange(previousMonth);

      const [
        currentJobsResponse,
        previousJobsResponse,
        currentTimeResponse,
        previousTimeResponse,
        employeesResponse,
      ] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            job_status,
            scheduled_start,
            estimated_price,
            materials_cost,
            recurring_service_id
          `)
          .gte("scheduled_start", currentRange.startIso)
          .lt("scheduled_start", currentRange.endIso),

        supabase
          .from("jobs")
          .select(`
            id,
            job_status,
            scheduled_start,
            estimated_price,
            materials_cost,
            recurring_service_id
          `)
          .gte("scheduled_start", previousRange.startIso)
          .lt("scheduled_start", previousRange.endIso),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            job_id,
            employee_id,
            entry_type,
            activity_type,
            clock_in_time,
            clock_out_time
          `)
          .gte("clock_in_time", currentRange.startIso)
          .lt("clock_in_time", currentRange.endIso),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            job_id,
            employee_id,
            entry_type,
            activity_type,
            clock_in_time,
            clock_out_time
          `)
          .gte("clock_in_time", previousRange.startIso)
          .lt("clock_in_time", previousRange.endIso),

        supabase
          .from("employees")
          .select("id, hourly_rate"),
      ]);

      const firstError =
        currentJobsResponse.error ||
        previousJobsResponse.error ||
        currentTimeResponse.error ||
        previousTimeResponse.error ||
        employeesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setCurrentJobs(
        (currentJobsResponse.data ?? []) as Job[],
      );
      setPreviousJobs(
        (previousJobsResponse.data ?? []) as Job[],
      );
      setCurrentEntries(
        (currentTimeResponse.data ?? []) as TimeEntry[],
      );
      setPreviousEntries(
        (previousTimeResponse.data ?? []) as TimeEntry[],
      );
      setEmployees(
        (employeesResponse.data ?? []) as Employee[],
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [selectedMonth],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const employeeRates = useMemo(() => {
    const result = new Map<string, number>();

    for (const employee of employees) {
      result.set(employee.id, employee.hourly_rate ?? 0);
    }

    return result;
  }, [employees]);

  const currentMetrics = useMemo(
    () =>
      calculateMonthMetrics(
        selectedMonth,
        currentJobs,
        currentEntries,
        employeeRates,
      ),
    [
      currentEntries,
      currentJobs,
      employeeRates,
      selectedMonth,
    ],
  );

  const previousMonth = useMemo(
    () => shiftMonthInput(selectedMonth, -1),
    [selectedMonth],
  );

  const previousMetrics = useMemo(
    () =>
      calculateMonthMetrics(
        previousMonth,
        previousJobs,
        previousEntries,
        employeeRates,
      ),
    [
      employeeRates,
      previousEntries,
      previousJobs,
      previousMonth,
    ],
  );

  const comparisons = useMemo(
    () => ({
      revenue: calculateChange(
        currentMetrics.revenue,
        previousMetrics.revenue,
      ),
      grossProfit: calculateChange(
        currentMetrics.grossProfit,
        previousMetrics.grossProfit,
      ),
      completedJobs: calculateChange(
        currentMetrics.completedJobs,
        previousMetrics.completedJobs,
      ),
      recurringRevenue: calculateChange(
        currentMetrics.recurringRevenue,
        previousMetrics.recurringRevenue,
      ),
      productionHours: calculateChange(
        currentMetrics.productionHours,
        previousMetrics.productionHours,
      ),
    }),
    [currentMetrics, previousMetrics],
  );

  function exportCsv() {
    const headers = [
      "Metric",
      currentMetrics.label,
      previousMetrics.label,
      "Change Percent",
    ];

    const rows = [
      [
        "Revenue",
        currentMetrics.revenue.toFixed(2),
        previousMetrics.revenue.toFixed(2),
        formatCsvChange(comparisons.revenue),
      ],
      [
        "Labor",
        currentMetrics.labor.toFixed(2),
        previousMetrics.labor.toFixed(2),
        formatCsvChange(
          calculateChange(
            currentMetrics.labor,
            previousMetrics.labor,
          ),
        ),
      ],
      [
        "Materials",
        currentMetrics.materials.toFixed(2),
        previousMetrics.materials.toFixed(2),
        formatCsvChange(
          calculateChange(
            currentMetrics.materials,
            previousMetrics.materials,
          ),
        ),
      ],
      [
        "Gross Profit",
        currentMetrics.grossProfit.toFixed(2),
        previousMetrics.grossProfit.toFixed(2),
        formatCsvChange(comparisons.grossProfit),
      ],
      [
        "Margin Percent",
        currentMetrics.margin?.toFixed(1) ?? "",
        previousMetrics.margin?.toFixed(1) ?? "",
        "",
      ],
      [
        "Completed Jobs",
        currentMetrics.completedJobs,
        previousMetrics.completedJobs,
        formatCsvChange(comparisons.completedJobs),
      ],
      [
        "Total Jobs",
        currentMetrics.totalJobs,
        previousMetrics.totalJobs,
        formatCsvChange(
          calculateChange(
            currentMetrics.totalJobs,
            previousMetrics.totalJobs,
          ),
        ),
      ],
      [
        "Recurring Revenue",
        currentMetrics.recurringRevenue.toFixed(2),
        previousMetrics.recurringRevenue.toFixed(2),
        formatCsvChange(comparisons.recurringRevenue),
      ],
      [
        "Production Hours",
        currentMetrics.productionHours.toFixed(2),
        previousMetrics.productionHours.toFixed(2),
        formatCsvChange(comparisons.productionHours),
      ],
    ];

    const csv = [headers, ...rows]
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
    anchor.download = `executive-monthly-report-${selectedMonth}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Executive Monthly Report
        </h1>

        <p className="text-gray-600">
          Loading monthly performance…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Owner Reports
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Executive Monthly Report
          </h1>

          <p className="mt-2 text-gray-600">
            Review financial performance, completed work,
            recurring revenue, and month-over-month movement.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reports"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Work Orders
          </Link>

          <Link
            href="/reports/clients"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Clients
          </Link>

          <Link
            href="/reports/services"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Services
          </Link>

          <Link
            href="/reports/technicians"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Technicians
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
            onClick={() => window.print()}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Print Report
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="w-full sm:max-w-xs">
            <span className="mb-2 block text-sm font-black">
              Reporting Month
            </span>

            <input
              type="month"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <button
            type="button"
            onClick={() => void loadReport(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Revenue"
          value={formatCurrency(currentMetrics.revenue)}
          comparison={comparisons.revenue}
          comparisonLabel="vs. prior month"
        />

        <MetricCard
          title="Gross Profit"
          value={formatCurrency(
            currentMetrics.grossProfit,
          )}
          comparison={comparisons.grossProfit}
          comparisonLabel="vs. prior month"
          warning={currentMetrics.grossProfit < 0}
        />

        <MetricCard
          title="Gross Margin"
          value={
            currentMetrics.margin === null
              ? "—"
              : `${currentMetrics.margin.toFixed(1)}%`
          }
          note="Target: 18% or higher"
          warning={
            currentMetrics.margin !== null &&
            currentMetrics.margin < 18
          }
        />

        <MetricCard
          title="Recurring Revenue"
          value={formatCurrency(
            currentMetrics.recurringRevenue,
          )}
          comparison={comparisons.recurringRevenue}
          comparisonLabel="vs. prior month"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Completed Work Orders"
          value={String(currentMetrics.completedJobs)}
          comparison={comparisons.completedJobs}
          comparisonLabel="vs. prior month"
        />

        <MetricCard
          title="Total Scheduled Work"
          value={String(currentMetrics.totalJobs)}
          note={`${calculateCompletionRate(
            currentMetrics.completedJobs,
            currentMetrics.totalJobs,
          )} completion rate`}
        />

        <MetricCard
          title="Production Hours"
          value={`${currentMetrics.productionHours.toFixed(
            2,
          )} hrs`}
          comparison={comparisons.productionHours}
          comparisonLabel="vs. prior month"
        />

        <MetricCard
          title="Direct Cost"
          value={formatCurrency(currentMetrics.totalCost)}
          note={`${formatCurrency(
            currentMetrics.labor,
          )} labor + ${formatCurrency(
            currentMetrics.materials,
          )} materials`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <MonthPanel metrics={currentMetrics} current />

        <MonthPanel metrics={previousMetrics} />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Month-over-Month Comparison
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
                  Metric
                </th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
                  {currentMetrics.label}
                </th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
                  {previousMetrics.label}
                </th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
                  Change
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              <ComparisonRow
                label="Revenue"
                current={formatCurrency(
                  currentMetrics.revenue,
                )}
                previous={formatCurrency(
                  previousMetrics.revenue,
                )}
                change={comparisons.revenue}
              />

              <ComparisonRow
                label="Gross Profit"
                current={formatCurrency(
                  currentMetrics.grossProfit,
                )}
                previous={formatCurrency(
                  previousMetrics.grossProfit,
                )}
                change={comparisons.grossProfit}
              />

              <ComparisonRow
                label="Gross Margin"
                current={formatPercent(
                  currentMetrics.margin,
                )}
                previous={formatPercent(
                  previousMetrics.margin,
                )}
                change={null}
              />

              <ComparisonRow
                label="Completed Work Orders"
                current={String(
                  currentMetrics.completedJobs,
                )}
                previous={String(
                  previousMetrics.completedJobs,
                )}
                change={comparisons.completedJobs}
              />

              <ComparisonRow
                label="Recurring Revenue"
                current={formatCurrency(
                  currentMetrics.recurringRevenue,
                )}
                previous={formatCurrency(
                  previousMetrics.recurringRevenue,
                )}
                change={comparisons.recurringRevenue}
              />

              <ComparisonRow
                label="Production Hours"
                current={`${currentMetrics.productionHours.toFixed(
                  2,
                )} hrs`}
                previous={`${previousMetrics.productionHours.toFixed(
                  2,
                )} hrs`}
                change={comparisons.productionHours}
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-black text-blue-950">
          Reporting Basis
        </h2>

        <p className="mt-2 text-sm leading-6 text-blue-900">
          Revenue uses estimated work-order prices. Labor uses
          closed production timers multiplied by employee hourly
          rates. Materials use saved work-order materials costs.
          Recurring revenue includes work orders connected to a
          recurring service record.
        </p>
      </section>
    </main>
  );
}

function MetricCard({
  title,
  value,
  note,
  comparison,
  comparisonLabel,
  warning = false,
}: {
  title: string;
  value: string;
  note?: string;
  comparison?: number | null;
  comparisonLabel?: string;
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

      {comparison !== undefined && (
        <p
          className={`mt-2 text-xs font-black ${
            comparison === null
              ? "text-gray-500"
              : comparison >= 0
                ? "text-green-700"
                : "text-red-700"
          }`}
        >
          {comparison === null
            ? "No prior-month baseline"
            : `${comparison >= 0 ? "+" : ""}${comparison.toFixed(
                1,
              )}%`}
          {comparisonLabel
            ? ` ${comparisonLabel}`
            : ""}
        </p>
      )}

      {note && (
        <p className="mt-2 text-xs font-bold text-gray-500">
          {note}
        </p>
      )}
    </section>
  );
}

function MonthPanel({
  metrics,
  current = false,
}: {
  metrics: MonthMetrics;
  current?: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-gray-500">
            {current ? "Selected Month" : "Previous Month"}
          </p>

          <h2 className="mt-1 text-xl font-black">
            {metrics.label}
          </h2>
        </div>

        {current && (
          <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-black text-bakerssPink">
            Current View
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <MetricLine
          label="Revenue"
          value={formatCurrency(metrics.revenue)}
        />
        <MetricLine
          label="Gross Profit"
          value={formatCurrency(metrics.grossProfit)}
        />
        <MetricLine
          label="Margin"
          value={formatPercent(metrics.margin)}
        />
        <MetricLine
          label="Completed"
          value={String(metrics.completedJobs)}
        />
        <MetricLine
          label="Recurring Revenue"
          value={formatCurrency(
            metrics.recurringRevenue,
          )}
        />
        <MetricLine
          label="Production Hours"
          value={`${metrics.productionHours.toFixed(2)} hrs`}
        />
      </dl>
    </section>
  );
}

function MetricLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </dt>

      <dd className="mt-1 text-lg font-black text-gray-950">
        {value}
      </dd>
    </div>
  );
}

function ComparisonRow({
  label,
  current,
  previous,
  change,
}: {
  label: string;
  current: string;
  previous: string;
  change: number | null;
}) {
  return (
    <tr>
      <td className="px-5 py-4 text-sm font-black text-gray-950">
        {label}
      </td>

      <td className="px-5 py-4 text-sm font-bold text-gray-900">
        {current}
      </td>

      <td className="px-5 py-4 text-sm font-bold text-gray-700">
        {previous}
      </td>

      <td className="px-5 py-4">
        <ChangeBadge value={change} />
      </td>
    </tr>
  );
}

function ChangeBadge({
  value,
}: {
  value: number | null;
}) {
  if (value === null) {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">
        —
      </span>
    );
  }

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${
        value >= 0
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {value >= 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function calculateMonthMetrics(
  monthInput: string,
  jobs: Job[],
  entries: TimeEntry[],
  employeeRates: Map<string, number>,
): MonthMetrics {
  let revenue = 0;
  let labor = 0;
  let materials = 0;
  let completedJobs = 0;
  let recurringRevenue = 0;
  let productionHours = 0;

  const completedStatuses = new Set([
    "completed",
    "complete",
    "closed",
    "invoiced",
  ]);

  for (const job of jobs) {
    const jobRevenue = job.estimated_price ?? 0;

    revenue += jobRevenue;
    materials += job.materials_cost ?? 0;

    if (
      completedStatuses.has(
        (job.job_status ?? "").toLowerCase(),
      )
    ) {
      completedJobs += 1;
    }

    if (job.recurring_service_id) {
      recurringRevenue += jobRevenue;
    }

    const jobEntries = entries.filter(
      (entry) =>
        entry.job_id === job.id &&
        entry.entry_type === "job",
    );

    for (const entry of jobEntries) {
      const hours = calculateEntryHours(entry);

      productionHours += hours;

      if (entry.employee_id) {
        labor +=
          hours *
          (employeeRates.get(entry.employee_id) ?? 0);
      }
    }
  }

  const totalCost = labor + materials;
  const grossProfit = revenue - totalCost;
  const margin =
    revenue > 0 ? (grossProfit / revenue) * 100 : null;

  return {
    label: formatMonthLabel(monthInput),
    startDate: getMonthRange(monthInput).startDate,
    endDate: getMonthRange(monthInput).endDate,
    revenue,
    labor,
    materials,
    totalCost,
    grossProfit,
    margin,
    completedJobs,
    totalJobs: jobs.length,
    recurringRevenue,
    productionHours,
  };
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

function calculateChange(
  current: number,
  previous: number,
) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / previous) * 100;
}

function calculateCompletionRate(
  completed: number,
  total: number,
) {
  if (total === 0) {
    return "—";
  }

  return `${((completed / total) * 100).toFixed(1)}%`;
}

function getCurrentMonthInput() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function shiftMonthInput(
  monthInput: string,
  offset: number,
) {
  const [year, month] = monthInput
    .split("-")
    .map(Number);

  const shifted = new Date(year, month - 1 + offset, 1);

  return `${shifted.getFullYear()}-${String(
    shifted.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function getMonthRange(monthInput: string) {
  const [year, month] = monthInput
    .split("-")
    .map(Number);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const lastDay = new Date(year, month, 0);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: formatDateInput(start),
    endDate: formatDateInput(lastDay),
  };
}

function formatMonthLabel(monthInput: string) {
  const [year, month] = monthInput
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatCsvChange(value: number | null) {
  return value === null ? "" : value.toFixed(1);
}

function escapeCsvValue(value: string) {
  const quote = String.fromCharCode(34);

  if (
    value.includes(",") ||
    value.includes(quote) ||
    value.includes("\n")
  ) {
    return (
      quote +
      value.split(quote).join(quote + quote) +
      quote
    );
  }

  return value;
}