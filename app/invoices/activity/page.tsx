"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Client = {
  id: string;
  client_name: string;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  invoice_status: string;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  amount_paid: number | null;
  reminder_status: string | null;
  last_reminder_at: string | null;
  next_follow_up_date: string | null;
  reminder_notes: string | null;
  reminder_count: number | null;
  clients: Client | Client[] | null;
};

type ActivityRow = {
  invoice: Invoice;
  client: Client | null;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
};

const ACTIVE_REMINDER_STATUSES = [
  "scheduled",
  "contacted",
  "promised",
  "disputed",
  "escalated",
] as const;

export default function AccountsReceivableActivityPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadActivity = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      await supabase.rpc("refresh_overdue_invoices");

      const response = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          client_id,
          invoice_status,
          due_date,
          subtotal,
          tax_amount,
          amount_paid,
          reminder_status,
          last_reminder_at,
          next_follow_up_date,
          reminder_notes,
          reminder_count,
          clients (
            id,
            client_name
          )
        `)
        .not("invoice_status", "in", '("paid","void")')
        .order("next_follow_up_date", {
          ascending: true,
          nullsFirst: false,
        })
        .order("due_date", {
          ascending: true,
          nullsFirst: false,
        });

      if (response.error) {
        setErrorMessage(response.error.message);
        setInvoices([]);
      } else {
        setInvoices((response.data ?? []) as Invoice[]);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const rows = useMemo<ActivityRow[]>(
    () =>
      invoices.map((invoice) => {
        const client = Array.isArray(invoice.clients)
          ? invoice.clients[0] ?? null
          : invoice.clients;

        const totalAmount =
          (invoice.subtotal ?? 0) +
          (invoice.tax_amount ?? 0);

        const balanceDue = Math.max(
          totalAmount - (invoice.amount_paid ?? 0),
          0,
        );

        return {
          invoice,
          client,
          totalAmount,
          balanceDue,
          daysOverdue: calculateDaysOverdue(
            invoice.due_date,
            balanceDue,
          ),
        };
      }),
    [invoices],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm
      .trim()
      .toLowerCase();

    return rows.filter((row) => {
      const statusMatches =
        statusFilter === "all" ||
        row.invoice.reminder_status === statusFilter;

      const searchMatches =
        normalizedSearch.length === 0 ||
        [
          row.invoice.invoice_number ?? "",
          row.client?.client_name ?? "",
          row.invoice.reminder_notes ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return statusMatches && searchMatches;
    });
  }, [rows, searchTerm, statusFilter]);

  const metrics = useMemo(() => {
    const today = getTodayInput();

    return rows.reduce(
      (result, row) => {
        result.totalOutstanding += row.balanceDue;

        if (
          row.invoice.next_follow_up_date &&
          row.invoice.next_follow_up_date <= today &&
          row.invoice.reminder_status !== "resolved"
        ) {
          result.followUpsDue += 1;
        }

        if (row.invoice.reminder_status === "promised") {
          result.promisesToPay += 1;
          result.promisedBalance += row.balanceDue;
        }

        if (row.invoice.reminder_status === "disputed") {
          result.disputed += 1;
          result.disputedBalance += row.balanceDue;
        }

        if (row.invoice.reminder_status === "escalated") {
          result.escalated += 1;
          result.escalatedBalance += row.balanceDue;
        }

        if (row.daysOverdue > 0) {
          result.overdueBalance += row.balanceDue;
        }

        return result;
      },
      {
        totalOutstanding: 0,
        overdueBalance: 0,
        followUpsDue: 0,
        promisesToPay: 0,
        promisedBalance: 0,
        disputed: 0,
        disputedBalance: 0,
        escalated: 0,
        escalatedBalance: 0,
      },
    );
  }, [rows]);

  const clientBalances = useMemo(() => {
    const result = new Map<
      string,
      {
        client: Client;
        balance: number;
        invoiceCount: number;
      }
    >();

    for (const row of rows) {
      if (!row.client) {
        continue;
      }

      const existing = result.get(row.client.id) ?? {
        client: row.client,
        balance: 0,
        invoiceCount: 0,
      };

      existing.balance += row.balanceDue;
      existing.invoiceCount += 1;

      result.set(row.client.id, existing);
    }

    return Array.from(result.values())
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);
  }, [rows]);

  function clearFilters() {
    setStatusFilter("all");
    setSearchTerm("");
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Accounts Receivable Activity
        </h1>

        <p className="text-gray-600">
          Loading collections activity…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Accounts Receivable
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Collections Activity
          </h1>

          <p className="mt-2 text-gray-600">
            Review follow-ups due, promises to pay, disputed
            invoices, escalated accounts, and client balances.
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
            href="/invoices/aging"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Aging
          </Link>

          <button
            type="button"
            onClick={() => void loadActivity(true)}
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          title="Outstanding"
          value={formatCurrency(
            metrics.totalOutstanding,
          )}
          note={`${rows.length} open invoices`}
        />

        <SummaryCard
          title="Overdue"
          value={formatCurrency(metrics.overdueBalance)}
          note="Past-due balances"
          warning={metrics.overdueBalance > 0}
        />

        <SummaryCard
          title="Follow-Ups Due"
          value={String(metrics.followUpsDue)}
          note="Due today or earlier"
          warning={metrics.followUpsDue > 0}
        />

        <SummaryCard
          title="Promises to Pay"
          value={String(metrics.promisesToPay)}
          note={formatCurrency(
            metrics.promisedBalance,
          )}
        />

        <SummaryCard
          title="Disputed"
          value={String(metrics.disputed)}
          note={formatCurrency(
            metrics.disputedBalance,
          )}
          warning={metrics.disputed > 0}
        />

        <SummaryCard
          title="Escalated"
          value={String(metrics.escalated)}
          note={formatCurrency(
            metrics.escalatedBalance,
          )}
          warning={metrics.escalated > 0}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-black">
                Search
              </span>

              <input
                type="search"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Invoice, client, or reminder note"
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black">
                Reminder Status
              </span>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="all">All statuses</option>
                <option value="not_started">
                  Not Started
                </option>
                <option value="scheduled">
                  Scheduled
                </option>
                <option value="contacted">
                  Contacted
                </option>
                <option value="promised">
                  Promised
                </option>
                <option value="disputed">
                  Disputed
                </option>
                <option value="escalated">
                  Escalated
                </option>
                <option value="resolved">
                  Resolved
                </option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <aside className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">
            Highest Client Balances
          </h2>

          <div className="mt-4 space-y-3">
            {clientBalances.map((item) => (
              <Link
                key={item.client.id}
                href={`/customers/${item.client.id}`}
                className="flex items-center justify-between rounded-xl bg-gray-50 p-4 hover:bg-gray-100"
              >
                <div>
                  <p className="font-black text-gray-950">
                    {item.client.client_name}
                  </p>

                  <p className="mt-1 text-xs font-bold text-gray-500">
                    {item.invoiceCount} open invoice
                    {item.invoiceCount === 1 ? "" : "s"}
                  </p>
                </div>

                <p className="font-black text-gray-950">
                  {formatCurrency(item.balance)}
                </p>
              </Link>
            ))}

            {clientBalances.length === 0 && (
              <p className="text-sm font-bold text-gray-500">
                No open client balances.
              </p>
            )}
          </div>
        </aside>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Collections Queue
          </h2>

          <p className="mt-1 text-sm font-bold text-gray-500">
            Showing {filteredRows.length} matching invoices.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Invoice",
                  "Client",
                  "Balance",
                  "Days Overdue",
                  "Reminder Status",
                  "Last Contact",
                  "Next Follow-Up",
                  "Count",
                  "Notes",
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
                  key={row.invoice.id}
                  className="hover:bg-gray-50"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/invoices/${row.invoice.id}`}
                      className="font-black text-gray-950 hover:text-bakerssPink"
                    >
                      {row.invoice.invoice_number ??
                        "Unnumbered Invoice"}
                    </Link>
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {row.client?.client_name ?? "—"}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(row.balanceDue)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.daysOverdue}
                  </td>

                  <td className="px-5 py-4">
                    <ReminderBadge
                      status={
                        row.invoice.reminder_status ??
                        "not_started"
                      }
                    />
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-700">
                    {formatDateTime(
                      row.invoice.last_reminder_at,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <FollowUpDate
                      value={
                        row.invoice.next_follow_up_date
                      }
                    />
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.invoice.reminder_count ?? 0}
                  </td>

                  <td className="max-w-sm px-5 py-4 text-sm font-bold text-gray-700">
                    {row.invoice.reminder_notes ?? "—"}
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No accounts match the selected filters.
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

function ReminderBadge({
  status,
}: {
  status: string;
}) {
  const className =
    status === "resolved"
      ? "bg-green-100 text-green-800"
      : status === "escalated" ||
          status === "disputed"
        ? "bg-red-100 text-red-800"
        : status === "promised"
          ? "bg-blue-100 text-blue-800"
          : status === "scheduled" ||
              status === "contacted"
            ? "bg-amber-100 text-amber-800"
            : "bg-gray-100 text-gray-800";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${className}`}
    >
      {formatReminderStatus(status)}
    </span>
  );
}

function FollowUpDate({
  value,
}: {
  value: string | null;
}) {
  if (!value) {
    return (
      <span className="text-sm font-bold text-gray-500">
        —
      </span>
    );
  }

  const overdue = value <= getTodayInput();

  return (
    <span
      className={`text-sm font-black ${
        overdue ? "text-red-700" : "text-gray-900"
      }`}
    >
      {formatDate(value)}
    </span>
  );
}

function calculateDaysOverdue(
  dueDate: string | null,
  balanceDue: number,
) {
  if (!dueDate || balanceDue <= 0) {
    return 0;
  }

  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const difference =
    today.getTime() - due.getTime();

  return difference > 0
    ? Math.floor(difference / 86_400_000)
    : 0;
}

function formatReminderStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

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

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}