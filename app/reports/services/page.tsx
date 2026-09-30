"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Service = {
  id: string;
  service_name: string;
};

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  materials_cost: number | null;
  service_id: string | null;
  services: Service | Service[] | null;
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
  full_name: string;
  hourly_rate: number | null;
};

type ServiceRow = {
  service: Service;
  workOrderCount: number;
  revenue: number;
  laborCost: number;
  materialsCost: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number | null;
  productionHours: number;
  revenuePerProductionHour: number | null;
};

export default function ServiceProfitabilityReportPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [startDate, setStartDate] = useState(
    getMonthStartInput(),
  );
  const [endDate, setEndDate] = useState(getTodayInput());
  const [serviceFilter, setServiceFilter] = useState("all");
  const [marginFilter, setMarginFilter] = useState("all");

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

      const [jobsResponse, timeResponse, employeesResponse] =
        await Promise.all([
          supabase
            .from("jobs")
            .select(`
              id,
              job_title,
              job_status,
              scheduled_start,
              estimated_price,
              materials_cost,
              service_id,
              services (
                id,
                service_name
              )
            `)
            .gte("scheduled_start", rangeStart)
            .lt("scheduled_start", rangeEnd),

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
            .gte("clock_in_time", rangeStart)
            .lt("clock_in_time", rangeEnd),

          supabase
            .from("employees")
            .select(`
              id,
              full_name,
              hourly_rate
            `),
        ]);

      const firstError =
        jobsResponse.error ||
        timeResponse.error ||
        employeesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setJobs((jobsResponse.data ?? []) as Job[]);
      setTimeEntries(
        (timeResponse.data ?? []) as TimeEntry[],
      );
      setEmployees(
        (employeesResponse.data ?? []) as Employee[],
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [endDate, startDate],
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

  const serviceRows = useMemo<ServiceRow[]>(() => {
    const rows = new Map<string, ServiceRow>();

    for (const job of jobs) {
      const service = Array.isArray(job.services)
        ? job.services[0] ?? null
        : job.services;

      if (!job.service_id || !service) {
        continue;
      }

      const existing = rows.get(job.service_id) ?? {
        service,
        workOrderCount: 0,
        revenue: 0,
        laborCost: 0,
        materialsCost: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMargin: null,
        productionHours: 0,
        revenuePerProductionHour: null,
      };

      existing.workOrderCount += 1;
      existing.revenue += job.estimated_price ?? 0;
      existing.materialsCost += job.materials_cost ?? 0;

      const jobEntries = timeEntries.filter(
        (entry) =>
          entry.job_id === job.id &&
          entry.entry_type === "job",
      );

      for (const entry of jobEntries) {
        const hours = calculateEntryHours(entry);

        existing.productionHours += hours;

        if (entry.employee_id) {
          existing.laborCost +=
            hours *
            (employeeRates.get(entry.employee_id) ?? 0);
        }
      }

      rows.set(job.service_id, existing);
    }

    return Array.from(rows.values())
      .map((row) => {
        row.totalCost =
          row.laborCost + row.materialsCost;
        row.grossProfit = row.revenue - row.totalCost;
        row.grossMargin =
          row.revenue > 0
            ? (row.grossProfit / row.revenue) * 100
            : null;
        row.revenuePerProductionHour =
          row.productionHours > 0
            ? row.revenue / row.productionHours
            : null;

        return row;
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [employeeRates, jobs, timeEntries]);

  const serviceOptions = useMemo(
    () =>
      serviceRows
        .map((row) => row.service)
        .sort((a, b) =>
          a.service_name.localeCompare(b.service_name),
        ),
    [serviceRows],
  );

  const filteredRows = useMemo(
    () =>
      serviceRows.filter((row) => {
        const serviceMatches =
          serviceFilter === "all" ||
          row.service.id === serviceFilter;

        const marginMatches =
          marginFilter === "all" ||
          (marginFilter === "negative" &&
            row.grossMargin !== null &&
            row.grossMargin < 0) ||
          (marginFilter === "under18" &&
            row.grossMargin !== null &&
            row.grossMargin >= 0 &&
            row.grossMargin < 18) ||
          (marginFilter === "18to30" &&
            row.grossMargin !== null &&
            row.grossMargin >= 18 &&
            row.grossMargin < 30) ||
          (marginFilter === "30plus" &&
            row.grossMargin !== null &&
            row.grossMargin >= 30);

        return serviceMatches && marginMatches;
      }),
    [marginFilter, serviceFilter, serviceRows],
  );

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (result, row) => {
          result.services += 1;
          result.workOrders += row.workOrderCount;
          result.revenue += row.revenue;
          result.labor += row.laborCost;
          result.materials += row.materialsCost;
          result.totalCost += row.totalCost;
          result.grossProfit += row.grossProfit;
          result.productionHours += row.productionHours;

          return result;
        },
        {
          services: 0,
          workOrders: 0,
          revenue: 0,
          labor: 0,
          materials: 0,
          totalCost: 0,
          grossProfit: 0,
          productionHours: 0,
        },
      ),
    [filteredRows],
  );

  const portfolioMargin =
    totals.revenue > 0
      ? (totals.grossProfit / totals.revenue) * 100
      : null;

  const revenuePerProductionHour =
    totals.productionHours > 0
      ? totals.revenue / totals.productionHours
      : null;

  function exportCsv() {
    const headers = [
      "Service",
      "Work Orders",
      "Revenue",
      "Production Hours",
      "Revenue Per Production Hour",
      "Labor Cost",
      "Materials Cost",
      "Total Cost",
      "Gross Profit",
      "Gross Margin Percent",
    ];

    const rows = filteredRows.map((row) => [
      row.service.service_name,
      row.workOrderCount,
      row.revenue.toFixed(2),
      row.productionHours.toFixed(2),
      row.revenuePerProductionHour === null
        ? ""
        : row.revenuePerProductionHour.toFixed(2),
      row.laborCost.toFixed(2),
      row.materialsCost.toFixed(2),
      row.totalCost.toFixed(2),
      row.grossProfit.toFixed(2),
      row.grossMargin === null
        ? ""
        : row.grossMargin.toFixed(1),
    ]);

    rows.push([
      "TOTALS",
      totals.workOrders,
      totals.revenue.toFixed(2),
      totals.productionHours.toFixed(2),
      revenuePerProductionHour === null
        ? ""
        : revenuePerProductionHour.toFixed(2),
      totals.labor.toFixed(2),
      totals.materials.toFixed(2),
      totals.totalCost.toFixed(2),
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
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `service-profitability-${startDate}-through-${endDate}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Service Profitability
        </h1>

        <p className="text-gray-600">
          Loading service profitability…
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
            Service Profitability
          </h1>

          <p className="mt-2 text-gray-600">
            Compare revenue, production labor, materials,
            gross profit, margin, and hourly production value
            by service.
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              Service
            </span>

            <select
              value={serviceFilter}
              onChange={(event) =>
                setServiceFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All services</option>

              {serviceOptions.map((service) => (
                <option
                  key={service.id}
                  value={service.id}
                >
                  {service.service_name}
                </option>
              ))}
            </select>
          </label>

          <label>
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
              <option value="negative">
                Negative margin
              </option>
              <option value="under18">
                0% to 17.9%
              </option>
              <option value="18to30">
                18% to 29.9%
              </option>
              <option value="30plus">
                30% and above
              </option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          title="Services"
          value={String(totals.services)}
          note="Matching selected filters"
        />

        <SummaryCard
          title="Revenue"
          value={formatCurrency(totals.revenue)}
          note={`${totals.workOrders} work orders`}
        />

        <SummaryCard
          title="Labor"
          value={formatCurrency(totals.labor)}
          note={`${totals.productionHours.toFixed(2)} production hours`}
        />

        <SummaryCard
          title="Materials"
          value={formatCurrency(totals.materials)}
          note="Saved work-order materials"
        />

        <SummaryCard
          title="Gross Profit"
          value={formatCurrency(totals.grossProfit)}
          note="Revenue minus direct costs"
          warning={totals.grossProfit < 0}
        />

        <SummaryCard
          title="Portfolio Margin"
          value={
            portfolioMargin === null
              ? "—"
              : `${portfolioMargin.toFixed(1)}%`
          }
          note={
            revenuePerProductionHour === null
              ? "Target: 18% or higher"
              : `${formatCurrency(revenuePerProductionHour)} per production hour`
          }
          warning={
            portfolioMargin !== null &&
            portfolioMargin < 18
          }
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Service Detail
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Service",
                  "Work Orders",
                  "Revenue",
                  "Production Hours",
                  "Revenue / Hour",
                  "Labor",
                  "Materials",
                  "Total Cost",
                  "Gross Profit",
                  "Margin",
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
                  key={row.service.id}
                  className="hover:bg-gray-50"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/services/${row.service.id}`}
                      className="font-black text-gray-950 hover:text-bakerssPink"
                    >
                      {row.service.service_name}
                    </Link>
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.workOrderCount}
                  </td>

                  <CurrencyCell value={row.revenue} />

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.productionHours.toFixed(2)}
                  </td>

                  <CurrencyCell
                    value={
                      row.revenuePerProductionHour ?? 0
                    }
                    muted={
                      row.revenuePerProductionHour === null
                    }
                  />

                  <CurrencyCell value={row.laborCost} />
                  <CurrencyCell
                    value={row.materialsCost}
                  />
                  <CurrencyCell value={row.totalCost} />
                  <CurrencyCell
                    value={row.grossProfit}
                    warning={row.grossProfit < 0}
                  />

                  <td className="px-5 py-4">
                    <MarginBadge value={row.grossMargin} />
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-10 text-center text-sm font-bold text-gray-500"
                  >
                    No service profitability data matches
                    the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-black text-blue-950">
          Calculation Method
        </h2>

        <p className="mt-2 text-sm leading-6 text-blue-900">
          Revenue uses each work order&apos;s estimated price.
          Labor uses closed job production timers multiplied by
          each employee&apos;s hourly rate. Materials use the
          saved work-order materials cost. Revenue per hour
          measures service revenue divided by recorded
          production hours.
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

function CurrencyCell({
  value,
  warning = false,
  muted = false,
}: {
  value: number;
  warning?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-5 py-4 text-sm font-black ${
        muted
          ? "text-gray-400"
          : warning
            ? "text-red-700"
            : "text-gray-900"
      }`}
    >
      {muted ? "—" : formatCurrency(value)}
    </td>
  );
}

function MarginBadge({
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

  const className =
    value < 0
      ? "bg-red-100 text-red-800"
      : value < 18
        ? "bg-amber-100 text-amber-800"
        : "bg-green-100 text-green-800";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${className}`}
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
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