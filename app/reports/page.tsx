"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  materials_cost: number | null;

  clients: {
    id: string;
    client_name: string;
  } | null;

  services: {
    id: string;
    service_name: string;
  } | null;

  employees: {
    id: string;
    full_name: string;
  } | null;
};

type TimeEntry = {
  id: string;
  job_id: string | null;
  employee_id: string | null;
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  hourly_rate: number | null;
};

type ProfitabilityRow = {
  job: Job;
  travelHours: number;
  onsiteHours: number;
  workHours: number;
  totalProductionHours: number;
  estimatedLaborCost: number;
  materialsCost: number;
  estimatedRevenue: number;
  totalEstimatedCost: number;
  grossProfit: number;
  grossMargin: number | null;
};

export default function ReportsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timeEntries, setTimeEntries] = useState<
    TimeEntry[]
  >([]);
  const [employees, setEmployees] = useState<
    Employee[]
  >([]);

  const [startDate, setStartDate] = useState(
    getMonthStartInput(),
  );
  const [endDate, setEndDate] = useState(
    getTodayInput(),
  );

  const [technicianFilter, setTechnicianFilter] =
    useState("all");
  const [serviceFilter, setServiceFilter] =
    useState("all");
  const [clientFilter, setClientFilter] =
    useState("all");
  const [marginFilter, setMarginFilter] =
    useState("all");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState("");

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
        jobsResponse,
        timeResponse,
        employeeResponse,
      ] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            job_title,
            job_status,
            scheduled_start,
            estimated_price,
            materials_cost,
            clients (
              id,
              client_name
            ),
            services (
              id,
              service_name
            ),
            employees (
              id,
              full_name
            )
          `)
          .gte("scheduled_start", rangeStart)
          .lt("scheduled_start", rangeEnd)
          .order("scheduled_start", {
            ascending: false,
          }),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            job_id,
            employee_id,
            activity_type,
            clock_in_time,
            clock_out_time
          `)
          .eq("entry_type", "job")
          .gte("clock_in_time", rangeStart)
          .lt("clock_in_time", rangeEnd),

        supabase
          .from("employees")
          .select(`
            id,
            full_name,
            hourly_rate
          `)
          .order("full_name", { ascending: true }),
      ]);

      const firstError =
        jobsResponse.error ||
        timeResponse.error ||
        employeeResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setJobs(
        (jobsResponse.data ?? []) as unknown as Job[],
      );

      setTimeEntries(
        (timeResponse.data ?? []) as TimeEntry[],
      );

      setEmployees(
        (employeeResponse.data ?? []) as Employee[],
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [endDate, startDate],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const employeeRateMap = useMemo(
    () =>
      new Map(
        employees.map((employee) => [
          employee.id,
          employee.hourly_rate ?? 0,
        ]),
      ),
    [employees],
  );

  const profitabilityRows = useMemo<
    ProfitabilityRow[]
  >(() => {
    return jobs.map((job) => {
      const jobEntries = timeEntries.filter(
        (entry) => entry.job_id === job.id,
      );

      let travelHours = 0;
      let onsiteHours = 0;
      let workHours = 0;
      let totalProductionHours = 0;
      let estimatedLaborCost = 0;

      for (const entry of jobEntries) {
        const hours = calculateEntryHours(entry);

        totalProductionHours += hours;

        if (entry.activity_type === "travel") {
          travelHours += hours;
        } else if (
          entry.activity_type === "onsite"
        ) {
          onsiteHours += hours;
        } else if (entry.activity_type === "work") {
          workHours += hours;
        }

        const hourlyRate = entry.employee_id
          ? employeeRateMap.get(entry.employee_id) ?? 0
          : 0;

        estimatedLaborCost += hours * hourlyRate;
      }

      const estimatedRevenue =
        job.estimated_price ?? 0;

      const materialsCost =
        job.materials_cost ?? 0;

      const totalEstimatedCost =
        estimatedLaborCost + materialsCost;

      const grossProfit =
        estimatedRevenue - totalEstimatedCost;

      const grossMargin =
        estimatedRevenue > 0
          ? (grossProfit / estimatedRevenue) * 100
          : null;

      return {
        job,
        travelHours,
        onsiteHours,
        workHours,
        totalProductionHours,
        estimatedLaborCost,
        materialsCost,
        estimatedRevenue,
        totalEstimatedCost,
        grossProfit,
        grossMargin,
      };
    });
  }, [employeeRateMap, jobs, timeEntries]);

  const technicians = useMemo(() => {
    const map = new Map<string, string>();

    for (const job of jobs) {
      if (job.employees?.id) {
        map.set(
          job.employees.id,
          job.employees.full_name,
        );
      }
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [jobs]);

  const services = useMemo(() => {
    const map = new Map<string, string>();

    for (const job of jobs) {
      if (job.services?.id) {
        map.set(
          job.services.id,
          job.services.service_name,
        );
      }
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [jobs]);

  const clients = useMemo(() => {
    const map = new Map<string, string>();

    for (const job of jobs) {
      if (job.clients?.id) {
        map.set(
          job.clients.id,
          job.clients.client_name,
        );
      }
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [jobs]);

  const filteredRows = useMemo(() => {
    return profitabilityRows.filter((row) => {
      if (
        technicianFilter !== "all" &&
        row.job.employees?.id !== technicianFilter
      ) {
        return false;
      }

      if (
        serviceFilter !== "all" &&
        row.job.services?.id !== serviceFilter
      ) {
        return false;
      }

      if (
        clientFilter !== "all" &&
        row.job.clients?.id !== clientFilter
      ) {
        return false;
      }

      if (marginFilter === "below_20") {
        return (
          row.grossMargin !== null &&
          row.grossMargin < 20
        );
      }

      if (marginFilter === "negative") {
        return row.grossProfit < 0;
      }

      if (marginFilter === "healthy") {
        return (
          row.grossMargin !== null &&
          row.grossMargin >= 20
        );
      }

      return true;
    });
  }, [
    clientFilter,
    marginFilter,
    profitabilityRows,
    serviceFilter,
    technicianFilter,
  ]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (result, row) => {
        result.revenue += row.estimatedRevenue;
        result.labor += row.estimatedLaborCost;
        result.materials += row.materialsCost;
        result.cost += row.totalEstimatedCost;
        result.grossProfit += row.grossProfit;
        result.hours += row.totalProductionHours;

        return result;
      },
      {
        revenue: 0,
        labor: 0,
        materials: 0,
        cost: 0,
        grossProfit: 0,
        hours: 0,
      },
    );
  }, [filteredRows]);

  const portfolioMargin =
    totals.revenue > 0
      ? (totals.grossProfit / totals.revenue) * 100
      : null;

  function exportCsv() {
    const headers = [
      "Work Order",
      "Scheduled Date",
      "Client",
      "Service",
      "Technician",
      "Status",
      "Revenue",
      "Travel Hours",
      "Onsite Hours",
      "Work Hours",
      "Production Hours",
      "Labor Cost",
      "Materials Cost",
      "Total Cost",
      "Gross Profit",
      "Gross Margin Percent",
    ];

    const rows = filteredRows.map((row) => [
      row.job.job_title,
      row.job.scheduled_start
        ? formatDate(row.job.scheduled_start)
        : "",
      row.job.clients?.client_name ?? "",
      row.job.services?.service_name ?? "",
      row.job.employees?.full_name ?? "",
      row.job.job_status ?? "",
      row.estimatedRevenue.toFixed(2),
      row.travelHours.toFixed(2),
      row.onsiteHours.toFixed(2),
      row.workHours.toFixed(2),
      row.totalProductionHours.toFixed(2),
      row.estimatedLaborCost.toFixed(2),
      row.materialsCost.toFixed(2),
      row.totalEstimatedCost.toFixed(2),
      row.grossProfit.toFixed(2),
      row.grossMargin === null
        ? ""
        : row.grossMargin.toFixed(1),
    ]);

    rows.push([
      "TOTALS",
      `${startDate} through ${endDate}`,
      "",
      "",
      "",
      "",
      totals.revenue.toFixed(2),
      "",
      "",
      "",
      totals.hours.toFixed(2),
      totals.labor.toFixed(2),
      totals.materials.toFixed(2),
      totals.cost.toFixed(2),
      totals.grossProfit.toFixed(2),
      portfolioMargin === null
        ? ""
        : portfolioMargin.toFixed(1),
    ]);

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
    const anchorElement =
      document.createElement("a");

    anchorElement.href = url;
    anchorElement.download = `work-order-profitability-${startDate}-through-${endDate}.csv`;

    document.body.appendChild(anchorElement);
    anchorElement.click();
    anchorElement.remove();

    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setTechnicianFilter("all");
    setServiceFilter("all");
    setClientFilter("all");
    setMarginFilter("all");
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Profitability Reports
        </h1>

        <p className="text-gray-600">
          Loading portfolio profitability…
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
            Work Order Profitability
          </h1>

          <p className="mt-2 text-gray-600">
            Review estimated revenue, production labor,
            materials, gross profit, and margin across work
            orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reports/budget-actuals"
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Budget vs. Actuals
          </Link>

          <Link
            href="/reports/profit-loss"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Profit & Loss
          </Link>

          <Link
            href="/reports/expenses"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Expense Report
          </Link>

          <Link
            href="/reports/executive"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Executive Monthly
          </Link>

          <Link
            href="/reports/services"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Service Profitability
          </Link>

          <Link
            href="/reports/clients"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Client Profitability
          </Link>

          <Link
            href="/reports/technicians"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Technician Performance
          </Link>

          <button
            type="button"
            onClick={() => void loadReport(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="block">
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

          <label className="block">
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

          <FilterSelect
            label="Technician"
            value={technicianFilter}
            onChange={setTechnicianFilter}
            options={technicians}
            allLabel="All technicians"
          />

          <FilterSelect
            label="Service"
            value={serviceFilter}
            onChange={setServiceFilter}
            options={services}
            allLabel="All services"
          />

          <FilterSelect
            label="Client"
            value={clientFilter}
            onChange={setClientFilter}
            options={clients}
            allLabel="All clients"
          />

          <label className="block">
            <span className="mb-2 block text-sm font-black">
              Margin
            </span>

            <select
              value={marginFilter}
              onChange={(event) =>
                setMarginFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All margins</option>
              <option value="below_20">
                Below 20%
              </option>
              <option value="negative">
                Negative profit
              </option>
              <option value="healthy">
                20% or higher
              </option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          title="Revenue"
          value={formatCurrency(totals.revenue)}
          note="Estimated work-order revenue"
        />

        <SummaryCard
          title="Labor"
          value={formatCurrency(totals.labor)}
          note="Closed production time"
        />

        <SummaryCard
          title="Materials"
          value={formatCurrency(totals.materials)}
          note="Recorded materials cost"
        />

        <SummaryCard
          title="Total Cost"
          value={formatCurrency(totals.cost)}
          note="Labor plus materials"
        />

        <SummaryCard
          title="Gross Profit"
          value={formatCurrency(totals.grossProfit)}
          note="Revenue minus estimated cost"
          warning={totals.grossProfit < 0}
        />

        <SummaryCard
          title="Portfolio Margin"
          value={
            portfolioMargin === null
              ? "—"
              : `${portfolioMargin.toFixed(1)}%`
          }
          note={`${filteredRows.length} matching work orders`}
          warning={
            portfolioMargin !== null &&
            portfolioMargin < 20
          }
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Work Order Detail
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Showing {filteredRows.length} matching work orders.
          </p>
        </header>

        {filteredRows.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-gray-500">
            No work orders match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <TableHeading>Work Order</TableHeading>
                  <TableHeading>Client</TableHeading>
                  <TableHeading>Service</TableHeading>
                  <TableHeading>Technician</TableHeading>
                  <TableHeading>Revenue</TableHeading>
                  <TableHeading>Hours</TableHeading>
                  <TableHeading>Labor</TableHeading>
                  <TableHeading>Materials</TableHeading>
                  <TableHeading>Total Cost</TableHeading>
                  <TableHeading>Gross Profit</TableHeading>
                  <TableHeading>Margin</TableHeading>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredRows.map((row) => (
                  <tr
                    key={row.job.id}
                    className="transition hover:bg-gray-50"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/work-orders/${row.job.id}`}
                        className="font-black text-gray-950 hover:text-bakerssPink"
                      >
                        {row.job.job_title}
                      </Link>

                      <p className="mt-1 text-xs font-bold text-gray-500">
                        {formatDate(
                          row.job.scheduled_start,
                        )}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm font-semibold text-gray-700">
                      {row.job.clients?.client_name ??
                        "No client"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700">
                      {row.job.services?.service_name ??
                        "No service"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700">
                      {row.job.employees?.full_name ??
                        "Unassigned"}
                    </td>

                    <MoneyCell
                      value={row.estimatedRevenue}
                    />

                    <td className="px-5 py-4 text-sm font-black text-gray-900">
                      {row.totalProductionHours.toFixed(2)}
                    </td>

                    <MoneyCell
                      value={row.estimatedLaborCost}
                    />

                    <MoneyCell
                      value={row.materialsCost}
                    />

                    <MoneyCell
                      value={row.totalEstimatedCost}
                    />

                    <MoneyCell
                      value={row.grossProfit}
                      warning={row.grossProfit < 0}
                    />

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                          row.grossMargin === null
                            ? "bg-gray-100 text-gray-700"
                            : row.grossMargin >= 20
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {row.grossMargin === null
                          ? "—"
                          : `${row.grossMargin.toFixed(
                              1,
                            )}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-black text-amber-950">
          Reporting Basis
        </h2>

        <p className="mt-2 text-sm leading-6 text-amber-900">
          Revenue is based on each work order&apos;s estimated
          price. Labor uses closed travel, onsite, and work
          timers multiplied by employee hourly rates. Open timers
          are excluded. Materials use the saved materials cost on
          each work order.
        </p>
      </section>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  allLabel: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
      >
        <option value="all">{allLabel}</option>

        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
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

function TableHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function MoneyCell({
  value,
  warning = false,
}: {
  value: number;
  warning?: boolean;
}) {
  return (
    <td
      className={`px-5 py-4 text-sm font-black ${
        warning ? "text-red-700" : "text-gray-900"
      }`}
    >
      {formatCurrency(value)}
    </td>
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

function formatDate(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}