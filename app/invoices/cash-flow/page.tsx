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
  invoice_status: string;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  amount_paid: number | null;
};

type Job = {
  id: string;
  job_title: string;
  scheduled_start: string | null;
  estimated_price: number | null;
  recurring_service_id: string | null;
  job_status: string | null;
};

type Expense = {
  id: string;
  expense_date: string;
  description: string;
  total_amount: number | null;
  is_recurring: boolean;
  recurring_frequency:
    | "weekly"
    | "biweekly"
    | "monthly"
    | "quarterly"
    | "annual"
    | null;
};

type ForecastItem = {
  id: string;
  source: "invoice" | "scheduled_work";
  label: string;
  expectedDate: string;
  amount: number;
  recurring: boolean;
  status: string;
};

type ForecastBucket = {
  label: string;
  inflow: number;
  outflow: number;
  itemCount: number;
};

export default function CashFlowForecastPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadForecast = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const today = getTodayInput();
      const ninetyDaysFromToday = addDaysToInput(
        today,
        90,
      );

      await supabase.rpc("refresh_overdue_invoices");

      const [
        invoiceResponse,
        jobsResponse,
        expensesResponse,
      ] = await Promise.all([
          supabase
            .from("invoices")
            .select(`
              id,
              invoice_number,
              invoice_status,
              due_date,
              subtotal,
              tax_amount,
              amount_paid
            `)
            .not("invoice_status", "in", '("paid","void")')
            .lte("due_date", ninetyDaysFromToday),

          supabase
            .from("jobs")
            .select(`
              id,
              job_title,
              scheduled_start,
              estimated_price,
              recurring_service_id,
              job_status
            `)
            .gte(
              "scheduled_start",
              `${today}T00:00:00`,
            )
            .lt(
              "scheduled_start",
              `${addDaysToInput(
                ninetyDaysFromToday,
                1,
              )}T00:00:00`,
            )
            .not(
              "job_status",
              "in",
              '("completed","complete","closed","invoiced","cancelled","canceled")',
            ),

          supabase
            .from("expenses")
            .select(`
              id,
              expense_date,
              description,
              total_amount,
              is_recurring,
              recurring_frequency
            `)
            .gte("expense_date", today)
            .lte("expense_date", ninetyDaysFromToday),
        ]);

      const firstError =
        invoiceResponse.error ||
        jobsResponse.error ||
        expensesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setInvoices([]);
        setJobs([]);
        setExpenses([]);
      } else {
        setInvoices(
          (invoiceResponse.data ?? []) as Invoice[],
        );
        setJobs((jobsResponse.data ?? []) as Job[]);
        setExpenses(
          (expensesResponse.data ?? []) as Expense[],
        );
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const items = useMemo<ForecastItem[]>(() => {
    const invoiceItems = invoices
      .filter((invoice) => invoice.due_date)
      .map((invoice) => {
        const total =
          (invoice.subtotal ?? 0) +
          (invoice.tax_amount ?? 0);

        const balance = Math.max(
          total - (invoice.amount_paid ?? 0),
          0,
        );

        return {
          id: `invoice-${invoice.id}`,
          source: "invoice" as const,
          label:
            invoice.invoice_number ??
            "Unnumbered Invoice",
          expectedDate: invoice.due_date as string,
          amount: balance,
          recurring: false,
          status: invoice.invoice_status,
        };
      })
      .filter((item) => item.amount > 0);

    const jobItems = jobs
      .filter((job) => job.scheduled_start)
      .map((job) => ({
        id: `job-${job.id}`,
        source: "scheduled_work" as const,
        label: job.job_title,
        expectedDate: formatDateInput(
          new Date(job.scheduled_start as string),
        ),
        amount: job.estimated_price ?? 0,
        recurring: Boolean(job.recurring_service_id),
        status: job.job_status ?? "scheduled",
      }))
      .filter((item) => item.amount > 0);

    return [...invoiceItems, ...jobItems].sort(
      (a, b) =>
        a.expectedDate.localeCompare(b.expectedDate),
    );
  }, [invoices, jobs]);

  const forecast = useMemo(() => {
    const today = getTodayInput();
    const day30 = addDaysToInput(today, 30);
    const day60 = addDaysToInput(today, 60);
    const day90 = addDaysToInput(today, 90);

    const buckets = {
      overdue: {
        label: "Overdue / Immediate",
        inflow: 0,
        outflow: 0,
        itemCount: 0,
      },
      next30: {
        label: "Next 30 Days",
        inflow: 0,
        outflow: 0,
        itemCount: 0,
      },
      days31to60: {
        label: "Days 31–60",
        inflow: 0,
        outflow: 0,
        itemCount: 0,
      },
      days61to90: {
        label: "Days 61–90",
        inflow: 0,
        outflow: 0,
        itemCount: 0,
      },
    };

    let invoiceCash = 0;
    let scheduledWork = 0;
    let recurringWork = 0;
    let projectedExpenses = 0;
    let recurringExpenses = 0;

    for (const item of items) {
      if (item.source === "invoice") {
        invoiceCash += item.amount;
      } else {
        scheduledWork += item.amount;

        if (item.recurring) {
          recurringWork += item.amount;
        }
      }

      if (item.expectedDate < today) {
        buckets.overdue.inflow += item.amount;
        buckets.overdue.itemCount += 1;
      } else if (item.expectedDate <= day30) {
        buckets.next30.inflow += item.amount;
        buckets.next30.itemCount += 1;
      } else if (item.expectedDate <= day60) {
        buckets.days31to60.inflow += item.amount;
        buckets.days31to60.itemCount += 1;
      } else if (item.expectedDate <= day90) {
        buckets.days61to90.inflow += item.amount;
        buckets.days61to90.itemCount += 1;
      }
    }

    for (const expense of expenses) {
      const amount = expense.total_amount ?? 0;

      projectedExpenses += amount;

      if (expense.is_recurring) {
        recurringExpenses += amount;
      }

      if (expense.expense_date <= day30) {
        buckets.next30.outflow += amount;
      } else if (expense.expense_date <= day60) {
        buckets.days31to60.outflow += amount;
      } else if (expense.expense_date <= day90) {
        buckets.days61to90.outflow += amount;
      }
    }

    const totalForecast =
      invoiceCash + scheduledWork;

    const netForecast =
      totalForecast - projectedExpenses;

    return {
      totalForecast,
      netForecast,
      invoiceCash,
      scheduledWork,
      recurringWork,
      projectedExpenses,
      recurringExpenses,
      buckets,
    };
  }, [expenses, items]);

  function exportCsv() {
    const headers = [
      "Type",
      "Source",
      "Reference",
      "Expected Date",
      "Amount",
      "Recurring",
      "Status",
    ];

    const inflowRows = items.map((item) => [
      "Inflow",
      item.source === "invoice"
        ? "Open Invoice"
        : "Scheduled Work",
      item.label,
      item.expectedDate,
      item.amount.toFixed(2),
      item.recurring ? "Yes" : "No",
      item.status,
    ]);

    const expenseRows = expenses.map((expense) => [
      "Outflow",
      "Expense",
      expense.description,
      expense.expense_date,
      (expense.total_amount ?? 0).toFixed(2),
      expense.is_recurring ? "Yes" : "No",
      expense.recurring_frequency ?? "",
    ]);

    const rows = [...inflowRows, ...expenseRows];

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
    anchor.download = `cash-flow-forecast-${getTodayInput()}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Cash-Flow Forecast
        </h1>

        <p className="text-gray-600">
          Loading projected cash flow…
        </p>
      </main>
    );
  }

  const bucketCards: ForecastBucket[] = [
    forecast.buckets.overdue,
    forecast.buckets.next30,
    forecast.buckets.days31to60,
    forecast.buckets.days61to90,
  ];

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Accounts Receivable
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Cash-Flow Forecast
          </h1>

          <p className="mt-2 text-gray-600">
            Project expected cash from open invoices and
            scheduled work over the next 90 days.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/invoices"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Invoices
          </Link>

          <Link
            href="/invoices/activity"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Collections Activity
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
            onClick={() => void loadForecast(true)}
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Gross Inflow"
          value={formatCurrency(
            forecast.totalForecast,
          )}
          note={`${items.length} projected cash items`}
        />

        <SummaryCard
          title="Projected Expenses"
          value={formatCurrency(
            forecast.projectedExpenses,
          )}
          note={`${expenses.length} expense items`}
          warning={forecast.projectedExpenses > 0}
        />

        <SummaryCard
          title="Net Cash Forecast"
          value={formatCurrency(
            forecast.netForecast,
          )}
          note="Gross inflow minus projected expenses"
          warning={forecast.netForecast < 0}
        />

        <SummaryCard
          title="Recurring Expense Load"
          value={formatCurrency(
            forecast.recurringExpenses,
          )}
          note="Recurring expenses in the next 90 days"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {bucketCards.map((bucket) => (
          <SummaryCard
            key={bucket.label}
            title={bucket.label}
            value={formatCurrency(
              bucket.inflow - bucket.outflow,
            )}
            note={`${formatCurrency(
              bucket.inflow,
            )} in · ${formatCurrency(
              bucket.outflow,
            )} out`}
            warning={
              bucket.inflow - bucket.outflow < 0
            }
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Forecast Detail
          </h2>

          <p className="mt-1 text-sm font-bold text-gray-500">
            Open invoices use due dates. Scheduled work uses
            the work-order schedule date.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Source",
                  "Reference",
                  "Expected Date",
                  "Amount",
                  "Recurring",
                  "Status",
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
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50"
                >
                  <td className="px-5 py-4">
                    <SourceBadge source={item.source} />
                  </td>

                  <td className="px-5 py-4">
                    {item.source === "invoice" ? (
                      <Link
                        href={`/invoices/${item.id.replace(
                          "invoice-",
                          "",
                        )}`}
                        className="font-black text-gray-950 hover:text-bakerssPink"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <Link
                        href={`/work-orders/${item.id.replace(
                          "job-",
                          "",
                        )}`}
                        className="font-black text-gray-950 hover:text-bakerssPink"
                      >
                        {item.label}
                      </Link>
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(item.expectedDate)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(item.amount)}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {item.recurring ? "Yes" : "No"}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold capitalize text-gray-800">
                    {item.status}
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No projected cash items were found for the
                    next 90 days.
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
            Projected Expense Detail
          </h2>

          <p className="mt-1 text-sm font-bold text-gray-500">
            Expenses dated within the next 90 days.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Expense",
                  "Date",
                  "Amount",
                  "Recurring",
                  "Frequency",
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
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {expense.description}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(expense.expense_date)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(
                      expense.total_amount ?? 0,
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {expense.is_recurring ? "Yes" : "No"}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold capitalize text-gray-800">
                    {expense.recurring_frequency ?? "—"}
                  </td>
                </tr>
              ))}

              {expenses.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No projected expenses were found for the
                    next 90 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-black text-blue-950">
          Forecast Basis
        </h2>

        <p className="mt-2 text-sm leading-6 text-blue-900">
          Open invoices are counted by due date. Scheduled
          work is counted by scheduled service date and
          estimated price. Expense records are counted by their
          expense date. Net cash equals projected inflow minus
          projected expenses. This still does not adjust for
          collection probability, tax reserves, or expenses that
          have not yet been entered.
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
          ? "border-red-200 bg-red-50"
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

function SourceBadge({
  source,
}: {
  source: ForecastItem["source"];
}) {
  const invoice = source === "invoice";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${
        invoice
          ? "bg-blue-100 text-blue-800"
          : "bg-green-100 text-green-800"
      }`}
    >
      {invoice ? "Open Invoice" : "Scheduled Work"}
    </span>
  );
}

function getTodayInput() {
  return formatDateInput(new Date());
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