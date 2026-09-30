"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type ExpenseCategory = {
  id: string;
  category_name: string;
  expense_type: string;
};

type Expense = {
  id: string;
  expense_date: string;
  vendor_name: string | null;
  description: string;
  amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  payment_method: string;
  is_recurring: boolean;
  category_id: string | null;
  expense_categories:
    | ExpenseCategory
    | ExpenseCategory[]
    | null;
};

type CategoryRow = {
  category: ExpenseCategory;
  expenseCount: number;
  total: number;
  recurringTotal: number;
  taxTotal: number;
};

export default function ExpenseReportPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [startDate, setStartDate] = useState(
    getMonthStartInput(),
  );
  const [endDate, setEndDate] = useState(getTodayInput());
  const [categoryFilter, setCategoryFilter] =
    useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
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

      const response = await supabase
        .from("expenses")
        .select(`
          id,
          expense_date,
          vendor_name,
          description,
          amount,
          tax_amount,
          total_amount,
          payment_method,
          is_recurring,
          category_id,
          expense_categories (
            id,
            category_name,
            expense_type
          )
        `)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: false });

      if (response.error) {
        setErrorMessage(response.error.message);
        setExpenses([]);
      } else {
        setExpenses((response.data ?? []) as Expense[]);
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

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, ExpenseCategory>();

    for (const row of normalizedExpenses) {
      if (row.category) {
        categories.set(row.category.id, row.category);
      }
    }

    return Array.from(categories.values()).sort((a, b) =>
      a.category_name.localeCompare(b.category_name),
    );
  }, [normalizedExpenses]);

  const filteredExpenses = useMemo(
    () =>
      normalizedExpenses.filter((row) => {
        const categoryMatches =
          categoryFilter === "all" ||
          row.category?.id === categoryFilter;

        const typeMatches =
          typeFilter === "all" ||
          row.category?.expense_type === typeFilter;

        return categoryMatches && typeMatches;
      }),
    [categoryFilter, normalizedExpenses, typeFilter],
  );

  const totals = useMemo(
    () =>
      filteredExpenses.reduce(
        (result, row) => {
          const total = row.expense.total_amount ?? 0;

          result.expenseCount += 1;
          result.total += total;
          result.tax += row.expense.tax_amount ?? 0;

          if (row.expense.is_recurring) {
            result.recurring += total;
          } else {
            result.oneTime += total;
          }

          return result;
        },
        {
          expenseCount: 0,
          total: 0,
          recurring: 0,
          oneTime: 0,
          tax: 0,
        },
      ),
    [filteredExpenses],
  );

  const categoryRows = useMemo<CategoryRow[]>(() => {
    const rows = new Map<string, CategoryRow>();

    for (const row of filteredExpenses) {
      if (!row.category) {
        continue;
      }

      const existing = rows.get(row.category.id) ?? {
        category: row.category,
        expenseCount: 0,
        total: 0,
        recurringTotal: 0,
        taxTotal: 0,
      };

      const total = row.expense.total_amount ?? 0;

      existing.expenseCount += 1;
      existing.total += total;
      existing.taxTotal += row.expense.tax_amount ?? 0;

      if (row.expense.is_recurring) {
        existing.recurringTotal += total;
      }

      rows.set(row.category.id, existing);
    }

    return Array.from(rows.values()).sort(
      (a, b) => b.total - a.total,
    );
  }, [filteredExpenses]);

  function exportCsv() {
    const headers = [
      "Expense Date",
      "Category",
      "Expense Type",
      "Vendor",
      "Description",
      "Payment Method",
      "Recurring",
      "Amount",
      "Tax",
      "Total",
    ];

    const rows = filteredExpenses.map((row) => [
      row.expense.expense_date,
      row.category?.category_name ?? "",
      row.category?.expense_type ?? "",
      row.expense.vendor_name ?? "",
      row.expense.description,
      row.expense.payment_method,
      row.expense.is_recurring ? "Yes" : "No",
      (row.expense.amount ?? 0).toFixed(2),
      (row.expense.tax_amount ?? 0).toFixed(2),
      (row.expense.total_amount ?? 0).toFixed(2),
    ]);

    rows.push([
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.tax.toFixed(2),
      totals.total.toFixed(2),
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
    anchor.download = `expense-report-${startDate}-through-${endDate}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Expense Report
        </h1>

        <p className="text-gray-600">
          Loading expense reporting…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Reports
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Expense & Overhead Report
          </h1>

          <p className="mt-2 text-gray-600">
            Analyze operating expenses by category, type,
            recurring status, and date range.
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
            href="/expenses"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Expenses
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
              Category
            </span>

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All categories</option>

              {categoryOptions.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.category_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Expense Type
            </span>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All types</option>
              <option value="operating">Operating</option>
              <option value="payroll">Payroll</option>
              <option value="materials">Materials</option>
              <option value="fuel">Fuel</option>
              <option value="insurance">Insurance</option>
              <option value="software">Software</option>
              <option value="vehicle">Vehicle</option>
              <option value="equipment">Equipment</option>
              <option value="tax">Tax</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="Total Expenses"
          value={formatCurrency(totals.total)}
          note={`${totals.expenseCount} expense records`}
        />

        <SummaryCard
          title="Recurring"
          value={formatCurrency(totals.recurring)}
          note="Recurring expense records"
        />

        <SummaryCard
          title="One-Time"
          value={formatCurrency(totals.oneTime)}
          note="Non-recurring expenses"
        />

        <SummaryCard
          title="Tax"
          value={formatCurrency(totals.tax)}
          note="Recorded expense tax"
        />

        <SummaryCard
          title="Average Expense"
          value={formatCurrency(
            totals.expenseCount > 0
              ? totals.total / totals.expenseCount
              : 0,
          )}
          note="Average total per record"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Category Summary
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Category",
                  "Type",
                  "Expenses",
                  "Recurring",
                  "Tax",
                  "Total",
                  "Share",
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
                <tr key={row.category.id}>
                  <td className="px-5 py-4 font-black text-gray-950">
                    {row.category.category_name}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold capitalize text-gray-700">
                    {row.category.expense_type}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.expenseCount}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(row.recurringTotal)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {formatCurrency(row.taxTotal)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(row.total)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {totals.total > 0
                      ? `${(
                          (row.total / totals.total) *
                          100
                        ).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}

              {categoryRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No expense data matches the selected filters.
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
            Expense Detail
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Date",
                  "Description",
                  "Category",
                  "Vendor",
                  "Payment Method",
                  "Recurring",
                  "Total",
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
              {filteredExpenses.map((row) => (
                <tr key={row.expense.id}>
                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(row.expense.expense_date)}
                  </td>

                  <td className="px-5 py-4">
                    <Link
                      href={`/expenses/${row.expense.id}`}
                      className="font-black text-gray-950 hover:text-bakerssPink"
                    >
                      {row.expense.description}
                    </Link>
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {row.category?.category_name ?? "—"}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {row.expense.vendor_name ?? "—"}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold capitalize text-gray-800">
                    {row.expense.payment_method.replaceAll(
                      "_",
                      " ",
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {row.expense.is_recurring ? "Yes" : "No"}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(
                      row.expense.total_amount ?? 0,
                    )}
                  </td>
                </tr>
              ))}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No expenses match the selected filters.
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

      <p className="mt-2 text-2xl font-black text-gray-950">
        {value}
      </p>

      <p className="mt-2 text-xs font-bold text-gray-500">
        {note}
      </p>
    </section>
  );
}

function getMonthStartInput() {
  const now = new Date();

  return formatDateInput(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
}

function getTodayInput() {
  return formatDateInput(new Date());
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

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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