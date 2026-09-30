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

type AgingInvoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  invoice_status: string;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  days_overdue: number | null;
  aging_bucket:
    | "current"
    | "1-30"
    | "31-60"
    | "61-90"
    | "90+"
    | "closed"
    | string;
  reminder_status: string | null;
  last_reminder_at: string | null;
  next_follow_up_date: string | null;
  reminder_notes: string | null;
  reminder_count: number | null;
  clients: Client | Client[] | null;
};

type AgingRow = {
  invoice: AgingInvoice;
  client: Client | null;
};

const AGING_BUCKETS = [
  "current",
  "1-30",
  "31-60",
  "61-90",
  "90+",
] as const;

const REMINDER_STATUSES = [
  ["not_started", "Not Started"],
  ["scheduled", "Scheduled"],
  ["contacted", "Contacted"],
  ["promised", "Promised"],
  ["disputed", "Disputed"],
  ["escalated", "Escalated"],
  ["resolved", "Resolved"],
] as const;

export default function InvoiceAgingPage() {
  const [invoices, setInvoices] = useState<AgingInvoice[]>([]);
  const [bucketFilter, setBucketFilter] = useState("all");
  const [reminderFilter, setReminderFilter] =
    useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadAging = useCallback(
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

      const response = await supabase
        .from("invoice_aging_detail")
        .select(`
          id,
          invoice_number,
          client_id,
          invoice_status,
          issue_date,
          due_date,
          total_amount,
          amount_paid,
          balance_due,
          days_overdue,
          aging_bucket,
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
        .neq("aging_bucket", "closed")
        .order("days_overdue", { ascending: false });

      if (response.error) {
        setErrorMessage(response.error.message);
        setInvoices([]);
      } else {
        setInvoices((response.data ?? []) as AgingInvoice[]);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadAging();
  }, [loadAging]);

  const rows = useMemo<AgingRow[]>(
    () =>
      invoices.map((invoice) => ({
        invoice,
        client: Array.isArray(invoice.clients)
          ? invoice.clients[0] ?? null
          : invoice.clients,
      })),
    [invoices],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm
      .trim()
      .toLowerCase();

    return rows.filter((row) => {
      const bucketMatches =
        bucketFilter === "all" ||
        row.invoice.aging_bucket === bucketFilter;

      const reminderMatches =
        reminderFilter === "all" ||
        row.invoice.reminder_status === reminderFilter;

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

      return (
        bucketMatches &&
        reminderMatches &&
        searchMatches
      );
    });
  }, [
    bucketFilter,
    reminderFilter,
    rows,
    searchTerm,
  ]);

  const totals = useMemo(() => {
    const result = {
      totalOutstanding: 0,
      followUpsDue: 0,
      buckets: new Map<string, {
        count: number;
        balance: number;
      }>(),
    };

    for (const bucket of AGING_BUCKETS) {
      result.buckets.set(bucket, {
        count: 0,
        balance: 0,
      });
    }

    const today = getTodayInput();

    for (const row of rows) {
      const balance = row.invoice.balance_due ?? 0;
      result.totalOutstanding += balance;

      const bucket =
        result.buckets.get(row.invoice.aging_bucket);

      if (bucket) {
        bucket.count += 1;
        bucket.balance += balance;
      }

      if (
        row.invoice.next_follow_up_date &&
        row.invoice.next_follow_up_date <= today &&
        row.invoice.reminder_status !== "resolved"
      ) {
        result.followUpsDue += 1;
      }
    }

    return result;
  }, [rows]);

  function clearFilters() {
    setBucketFilter("all");
    setReminderFilter("all");
    setSearchTerm("");
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Invoice Aging
        </h1>

        <p className="text-gray-600">
          Loading aging and follow-up data…
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
            Invoice Aging & Follow-Up
          </h1>

          <p className="mt-2 text-gray-600">
            Prioritize collections by aging bucket, reminder
            status, and scheduled follow-up date.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/invoices"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Back to Invoices
          </Link>

          <button
            type="button"
            onClick={() => void loadAging(true)}
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
            totals.totalOutstanding,
          )}
          note={`${rows.length} open invoices`}
        />

        {AGING_BUCKETS.map((bucket) => {
          const bucketTotals =
            totals.buckets.get(bucket) ?? {
              count: 0,
              balance: 0,
            };

          return (
            <SummaryCard
              key={bucket}
              title={formatBucket(bucket)}
              value={formatCurrency(
                bucketTotals.balance,
              )}
              note={`${bucketTotals.count} invoice${
                bucketTotals.count === 1 ? "" : "s"
              }`}
              warning={
                bucket !== "current" &&
                bucketTotals.balance > 0
              }
            />
          );
        })}
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
              placeholder="Invoice, client, or note"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Aging Bucket
            </span>

            <select
              value={bucketFilter}
              onChange={(event) =>
                setBucketFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All buckets</option>

              {AGING_BUCKETS.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {formatBucket(bucket)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Reminder Status
            </span>

            <select
              value={reminderFilter}
              onChange={(event) =>
                setReminderFilter(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All statuses</option>

              {REMINDER_STATUSES.map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
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

        {totals.followUpsDue > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
            {totals.followUpsDue} follow-up
            {totals.followUpsDue === 1 ? " is" : "s are"} due
            today or earlier.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Aging Detail
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
                  "Due Date",
                  "Days Overdue",
                  "Bucket",
                  "Balance",
                  "Reminder Status",
                  "Last Reminder",
                  "Next Follow-Up",
                  "Count",
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

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(row.invoice.due_date)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-900">
                    {row.invoice.days_overdue ?? 0}
                  </td>

                  <td className="px-5 py-4">
                    <AgingBadge
                      bucket={row.invoice.aging_bucket}
                    />
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(
                      row.invoice.balance_due ?? 0,
                    )}
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

function AgingBadge({
  bucket,
}: {
  bucket: string;
}) {
  const className =
    bucket === "current"
      ? "bg-green-100 text-green-800"
      : bucket === "1-30"
        ? "bg-amber-100 text-amber-800"
        : bucket === "31-60"
          ? "bg-orange-100 text-orange-800"
          : "bg-red-100 text-red-800";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${className}`}
    >
      {formatBucket(bucket)}
    </span>
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

function formatBucket(value: string) {
  return value === "current"
    ? "Current"
    : `${value} Days`;
}

function formatReminderStatus(value: string) {
  return (
    REMINDER_STATUSES.find(
      ([status]) => status === value,
    )?.[1] ??
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) =>
        character.toUpperCase(),
      )
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