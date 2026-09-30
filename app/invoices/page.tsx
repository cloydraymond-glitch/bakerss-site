"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type Client = {
  id: string;
  client_name: string;
};

type Job = {
  id: string;
  job_title: string;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  job_id: string | null;
  invoice_status:
    | "draft"
    | "sent"
    | "partial"
    | "paid"
    | "overdue"
    | "void"
    | string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  amount_paid: number | null;
  description: string | null;
  created_at: string | null;
  clients: Client | Client[] | null;
  jobs: Job | Job[] | null;
};

type InvoiceRow = {
  invoice: Invoice;
  client: Client | null;
  job: Job | null;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadInvoices = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const overdueResponse = await supabase.rpc(
        "refresh_overdue_invoices",
      );

      if (overdueResponse.error) {
        setErrorMessage(overdueResponse.error.message);
      }

      const invoiceResponse = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          client_id,
          job_id,
          invoice_status,
          issue_date,
          due_date,
          subtotal,
          tax_amount,
          amount_paid,
          description,
          created_at,
          clients (
            id,
            client_name
          ),
          jobs (
            id,
            job_title
          )
        `)
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (invoiceResponse.error) {
        setErrorMessage(invoiceResponse.error.message);
        setInvoices([]);
      } else {
        setInvoices(
          (invoiceResponse.data ?? []) as Invoice[],
        );
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const rows = useMemo<InvoiceRow[]>(
    () =>
      invoices.map((invoice) => {
        const client = Array.isArray(invoice.clients)
          ? invoice.clients[0] ?? null
          : invoice.clients;

        const job = Array.isArray(invoice.jobs)
          ? invoice.jobs[0] ?? null
          : invoice.jobs;

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
          job,
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

  const clientOptions = useMemo(() => {
    const clients = new Map<string, Client>();

    for (const row of rows) {
      if (row.client) {
        clients.set(row.client.id, row.client);
      }
    }

    return Array.from(clients.values()).sort((a, b) =>
      a.client_name.localeCompare(b.client_name),
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm
      .trim()
      .toLowerCase();

    return rows.filter((row) => {
      const statusMatches =
        statusFilter === "all" ||
        row.invoice.invoice_status === statusFilter;

      const clientMatches =
        clientFilter === "all" ||
        row.client?.id === clientFilter;

      const searchableText = [
        row.invoice.invoice_number ?? "",
        row.client?.client_name ?? "",
        row.job?.job_title ?? "",
        row.invoice.description ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const searchMatches =
        normalizedSearch.length === 0 ||
        searchableText.includes(normalizedSearch);

      return (
        statusMatches &&
        clientMatches &&
        searchMatches
      );
    });
  }, [
    clientFilter,
    rows,
    searchTerm,
    statusFilter,
  ]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (result, row) => {
          const status = row.invoice.invoice_status;

          result.totalInvoiced += row.totalAmount;

          if (status === "paid") {
            result.totalPaid += row.totalAmount;
          }

          if (
            status !== "paid" &&
            status !== "void"
          ) {
            result.totalOutstanding += row.balanceDue;
            result.openInvoices += 1;
          }

          if (status === "overdue") {
            result.totalOverdue += row.balanceDue;
            result.overdueInvoices += 1;
          }

          return result;
        },
        {
          totalInvoiced: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          totalOverdue: 0,
          openInvoices: 0,
          overdueInvoices: 0,
        },
      ),
    [rows],
  );

  function clearFilters() {
    setStatusFilter("all");
    setClientFilter("all");
    setSearchTerm("");
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Invoices
        </h1>

        <p className="text-gray-600">
          Loading accounts receivable…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Accounts Receivable
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Invoices
          </h1>

          <p className="mt-2 text-gray-600">
            Track invoiced revenue, payments, outstanding
            balances, and overdue receivables.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/invoices/cash-flow"
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Cash-Flow Forecast
          </Link>

          <Link
            href="/invoices/activity"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Collections Activity
          </Link>

          <Link
            href="/invoices/aging"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Aging & Follow-Up
          </Link>

          <Link
            href="/invoices/recurring-billing"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Recurring Billing
          </Link>

          <Link
            href="/invoices/payments"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Payments
          </Link>

          <button
            type="button"
            onClick={() => void loadInvoices(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/invoices/new"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            New Invoice
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          title="Total Invoiced"
          value={formatCurrency(totals.totalInvoiced)}
          note={`${rows.length} total invoices`}
        />

        <SummaryCard
          title="Paid"
          value={formatCurrency(totals.totalPaid)}
          note="Fully paid invoices"
        />

        <SummaryCard
          title="Outstanding"
          value={formatCurrency(
            totals.totalOutstanding,
          )}
          note={`${totals.openInvoices} open invoices`}
        />

        <SummaryCard
          title="Overdue"
          value={formatCurrency(totals.totalOverdue)}
          note={`${totals.overdueInvoices} overdue invoices`}
          warning={totals.totalOverdue > 0}
        />

        <SummaryCard
          title="Collection Rate"
          value={formatPercent(
            totals.totalInvoiced > 0
              ? (totals.totalPaid /
                  totals.totalInvoiced) *
                  100
              : null,
          )}
          note="Paid divided by invoiced"
        />

        <SummaryCard
          title="Open Balance"
          value={formatCurrency(
            totals.totalOutstanding,
          )}
          note="Excludes paid and void invoices"
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label>
            <span className="mb-2 block text-sm font-black">
              Search
            </span>

            <input
              type="search"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Invoice, client, or work order"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Status
            </span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Client
            </span>

            <select
              value={clientFilter}
              onChange={(event) =>
                setClientFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All clients</option>

              {clientOptions.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.client_name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Invoice Detail
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
                  "Work Order",
                  "Issue Date",
                  "Due Date",
                  "Status",
                  "Total",
                  "Paid",
                  "Balance",
                  "Aging",
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
                    {row.client ? (
                      <Link
                        href={`/customers/${row.client.id}`}
                        className="hover:text-bakerssPink"
                      >
                        {row.client.client_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {row.job ? (
                      <Link
                        href={`/work-orders/${row.job.id}`}
                        className="hover:text-bakerssPink"
                      >
                        {row.job.job_title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(row.invoice.issue_date)}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(row.invoice.due_date)}
                  </td>

                  <td className="px-5 py-4">
                    <StatusBadge
                      status={
                        row.invoice.invoice_status
                      }
                    />
                  </td>

                  <CurrencyCell value={row.totalAmount} />
                  <CurrencyCell
                    value={row.invoice.amount_paid ?? 0}
                  />
                  <CurrencyCell
                    value={row.balanceDue}
                    warning={
                      row.invoice.invoice_status ===
                      "overdue"
                    }
                  />

                  <td className="px-5 py-4">
                    {row.daysOverdue > 0 ? (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800">
                        {row.daysOverdue} days
                      </span>
                    ) : row.balanceDue > 0 ? (
                      <span className="text-sm font-bold text-gray-600">
                        Current
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-green-700">
                        Paid
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No invoices match the selected filters.
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

function CurrencyCell({
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

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized = status.toLowerCase();

  const className =
    normalized === "paid"
      ? "bg-green-100 text-green-800"
      : normalized === "overdue"
        ? "bg-red-100 text-red-800"
        : normalized === "partial"
          ? "bg-amber-100 text-amber-800"
          : normalized === "sent"
            ? "bg-blue-100 text-blue-800"
            : normalized === "void"
              ? "bg-gray-200 text-gray-700"
              : "bg-gray-100 text-gray-800";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${className}`}
    >
      {normalized}
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
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