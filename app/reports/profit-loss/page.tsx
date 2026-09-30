"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Invoice = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  total_amount: number | null;
  invoice_status: string | null;
};

type ExpenseCategory = {
  id: string;
  category_name: string;
  expense_type: string;
};

type Expense = {
  id: string;
  expense_date: string;
  description: string;
  total_amount: number | null;
  category_id: string | null;
  expense_categories:
    | ExpenseCategory
    | ExpenseCategory[]
    | null;
};

type MonthlyRow = {
  monthKey: string;
  monthLabel: string;
  revenue: number;
  directCosts: number;
  overhead: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
};

type CategoryRow = {
  categoryName: string;
  expenseType: string;
  classification: "Direct Cost" | "Overhead";
  total: number;
};

const DIRECT_COST_TYPES = new Set([
  "payroll",
  "materials",
  "fuel",
  "vehicle",
  "equipment",
]);

export default function ProfitLossReportPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [startDate, setStartDate] = useState(
    getYearStartInput(),
  );
  const [endDate, setEndDate] = useState(getTodayInput());
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

      const [invoiceResponse, expenseResponse] =
        await Promise.all([
          supabase
            .from("invoices")
            .select(`
              id,
              invoice_number,
              invoice_date,
              total_amount,
              invoice_status
            `)
            .gte("invoice_date", startDate)
            .lte("invoice_date", endDate)
            .not(
              "invoice_status",
              "in",
              '("void","voided","cancelled","canceled","draft")',
            )
            .order("invoice_date", { ascending: true }),

          supabase
            .from("expenses")
            .select(`
              id,
              expense_date,
              description,
              total_amount,
              category_id,
              expense_categories (
                id,
                category_name,
                expense_type
              )
            `)
            .gte("expense_date", startDate)
            .lte("expense_date", endDate)
            .order("expense_date", { ascending: true }),
        ]);

      const firstError =
        invoiceResponse.error || expenseResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setInvoices([]);
        setExpenses([]);
      } else {
        setInvoices(
          (invoiceResponse.data ?? []) as Invoice[],
        );
        setExpenses(
          (expenseResponse.data ?? []) as Expense[],
        );
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [endDate, startDate],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const normalizedExpenses = useMemo(
    () =>
      expenses.map((expense) => ({
        expense,
        category: Array.isArray(
          expense.expense_categories,
        )
          ? expense.expense_categories[0] ?? null
          : expense.expense_categories,
      })),
    [expenses],
  );

  const totals = useMemo(() => {
    const revenue = invoices.reduce(
      (sum, invoice) =>
        sum + (invoice.total_amount ?? 0),
      0,
    );

    let directCosts = 0;
    let overhead = 0;

    for (const row of normalizedExpenses) {
      const amount = row.expense.total_amount ?? 0;
      const expenseType =
        row.category?.expense_type ?? "other";

      if (DIRECT_COST_TYPES.has(expenseType)) {
        directCosts += amount;
      } else {
        overhead += amount;
      }
    }

    const grossProfit = revenue - directCosts;
    const netProfit = grossProfit - overhead;
    const margin =
      revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      directCosts,
      overhead,
      grossProfit,
      netProfit,
      margin,
    };
  }, [invoices, normalizedExpenses]);

  const monthlyRows = useMemo<MonthlyRow[]>(() => {
    const rows = new Map<
      string,
      {
        revenue: number;
        directCosts: number;
        overhead: number;
      }
    >();

    for (const monthKey of enumerateMonths(
      startDate,
      endDate,
    )) {
      rows.set(monthKey, {
        revenue: 0,
        directCosts: 0,
        overhead: 0,
      });
    }

    for (const invoice of invoices) {
      const monthKey = invoice.invoice_date.slice(0, 7);
      const row = rows.get(monthKey);

      if (row) {
        row.revenue += invoice.total_amount ?? 0;
      }
    }

    for (const item of normalizedExpenses) {
      const monthKey =
        item.expense.expense_date.slice(0, 7);
      const row = rows.get(monthKey);

      if (!row) {
        continue;
      }

      const amount = item.expense.total_amount ?? 0;
      const expenseType =
        item.category?.expense_type ?? "other";

      if (DIRECT_COST_TYPES.has(expenseType)) {
        row.directCosts += amount;
      } else {
        row.overhead += amount;
      }
    }

    return Array.from(rows.entries()).map(
      ([monthKey, values]) => {
        const grossProfit =
          values.revenue - values.directCosts;
        const netProfit =
          grossProfit - values.overhead;

        return {
          monthKey,
          monthLabel: formatMonth(monthKey),
          revenue: values.revenue,
          directCosts: values.directCosts,
          overhead: values.overhead,
          grossProfit,
          netProfit,
          margin:
            values.revenue > 0
              ? (netProfit / values.revenue) * 100
              : 0,
        };
      },
    );
  }, [endDate, invoices, normalizedExpenses, startDate]);

  const categoryRows = useMemo<CategoryRow[]>(() => {
    const rows = new Map<string, CategoryRow>();

    for (const item of normalizedExpenses) {
      const categoryName =
        item.category?.category_name ?? "Uncategorized";
      const expenseType =
        item.category?.expense_type ?? "other";
      const classification = DIRECT_COST_TYPES.has(
        expenseType,
      )
        ? "Direct Cost"
        : "Overhead";
      const key = `${categoryName}:${expenseType}`;

      const existing = rows.get(key) ?? {
        categoryName,
        expenseType,
        classification,
        total: 0,
      };

      existing.total += item.expense.total_amount ?? 0;
      rows.set(key, existing);
    }

    return Array.from(rows.values()).sort(
      (a, b) => b.total - a.total,
    );
  }, [normalizedExpenses]);

  function exportCsv() {
    const headers = [
      "Month",
      "Revenue",
      "Direct Costs",
      "Gross Profit",
      "Overhead",
      "Net Profit",
      "Net Margin",
    ];

    const rows = monthlyRows.map((row) => [
      row.monthLabel,
      row.revenue.toFixed(2),
      row.directCosts.toFixed(2),
      row.grossProfit.toFixed(2),
      row.overhead.toFixed(2),
      row.netProfit.toFixed(2),
      `${row.margin.toFixed(2)}%`,
    ]);

    rows.push([
      "TOTAL",
      totals.revenue.toFixed(2),
      totals.directCosts.toFixed(2),
      totals.grossProfit.toFixed(2),
      totals.overhead.toFixed(2),
      totals.netProfit.toFixed(2),
      `${totals.margin.toFixed(2)}%`,
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
    anchor.download = `profit-loss-${startDate}-through-${endDate}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Profit & Loss
        </h1>

        <p className="text-gray-600">
          Loading financial performance…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Financial Reports
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Profit & Loss
          </h1>

          <p className="mt-2 text-gray-600">
            Revenue, direct costs, overhead, gross profit,
            and net profit by month.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reports"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Reports
          </Link>

          <Link
            href="/reports/expenses"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Expense Report
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
        <div className="grid gap-4 md:grid-cols-2">
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
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="Revenue"
          value={formatCurrency(totals.revenue)}
          note={`${invoices.length} posted invoices`}
        />

        <SummaryCard
          title="Direct Costs"
          value={formatCurrency(totals.directCosts)}
          note="Payroll, materials, fuel, vehicle, and equipment"
        />

        <SummaryCard
          title="Gross Profit"
          value={formatCurrency(totals.grossProfit)}
          note="Revenue minus direct costs"
          warning={totals.grossProfit < 0}
        />

        <SummaryCard
          title="Overhead"
          value={formatCurrency(totals.overhead)}
          note="Operating and administrative expenses"
        />

        <SummaryCard
          title="Net Profit"
          value={formatCurrency(totals.netProfit)}
          note="Gross profit minus overhead"
          warning={totals.netProfit < 0}
        />

        <SummaryCard
          title="Net Margin"
          value={`${totals.margin.toFixed(1)}%`}
          note="Net profit divided by revenue"
          warning={totals.margin < 18}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Monthly Profit & Loss
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Month",
                  "Revenue",
                  "Direct Costs",
                  "Gross Profit",
                  "Overhead",
                  "Net Profit",
                  "Net Margin",
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
              {monthlyRows.map((row) => (
                <tr key={row.monthKey}>
                  <td className="px-5 py-4 font-black text-gray-950">
                    {row.monthLabel}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(row.revenue)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(row.directCosts)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(row.grossProfit)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(row.overhead)}
                  </td>

                  <td
                    className={`px-5 py-4 text-sm font-black ${
                      row.netProfit < 0
                        ? "text-red-700"
                        : "text-gray-950"
                    }`}
                  >
                    {formatCurrency(row.netProfit)}
                  </td>

                  <td
                    className={`px-5 py-4 text-sm font-black ${
                      row.margin < 18
                        ? "text-amber-700"
                        : "text-green-700"
                    }`}
                  >
                    {row.margin.toFixed(1)}%
                  </td>
                </tr>
              ))}

              {monthlyRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No financial data exists for this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Expense Classification
          </h2>

          <p className="mt-1 text-sm font-bold text-gray-500">
            Categories classified as direct costs reduce gross
            profit. Remaining categories are treated as overhead.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Category",
                  "Expense Type",
                  "Classification",
                  "Total",
                  "Share of Expenses",
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
              {categoryRows.map((row) => (
                <tr
                  key={`${row.categoryName}:${row.expenseType}`}
                >
                  <td className="px-5 py-4 font-black text-gray-950">
                    {row.categoryName}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold capitalize text-gray-700">
                    {row.expenseType}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.classification}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(row.total)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {totals.directCosts + totals.overhead > 0
                      ? `${(
                          (row.total /
                            (totals.directCosts +
                              totals.overhead)) *
                          100
                        ).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}

              {categoryRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No expense categories exist for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-black text-blue-950">
          Accounting Basis
        </h2>

        <p className="mt-2 text-sm font-bold leading-6 text-blue-900">
          Revenue is based on non-draft, non-void invoices by
          invoice date. Expenses are based on expense date.
          Payroll, materials, fuel, vehicle, and equipment are
          treated as direct costs. All other expense types are
          treated as overhead. This is an internal management
          report and is not a substitute for tax-accounting
          statements.
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

      <p
        className={`mt-2 text-2xl font-black ${
          warning ? "text-amber-800" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs font-bold text-gray-500">
        {note}
      </p>
    </section>
  );
}

function getYearStartInput() {
  const now = new Date();

  return `${now.getFullYear()}-01-01`;
}

function getTodayInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(
    2,
    "0",
  );
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function enumerateMonths(
  startDate: string,
  endDate: string,
) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    1,
  );
  const last = new Date(
    end.getFullYear(),
    end.getMonth(),
    1,
  );
  const months: string[] = [];

  while (cursor <= last) {
    months.push(
      `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1,
      ).padStart(2, "0")}`,
    );

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function formatMonth(monthKey: string) {
  const date = new Date(`${monthKey}-01T00:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
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