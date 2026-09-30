"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../../lib/supabase/client";

type Client = {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
};

type Job = {
  id: string;
  job_title: string;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  invoice_status: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  amount_paid: number | null;
  description: string | null;
  clients: Client | Client[] | null;
  jobs: Job | Job[] | null;
};

export default function CustomerInvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadInvoice = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const response = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        invoice_status,
        issue_date,
        due_date,
        subtotal,
        tax_amount,
        amount_paid,
        description,
        clients (
          id,
          client_name,
          email,
          phone
        ),
        jobs (
          id,
          job_title
        )
      `)
      .eq("id", invoiceId)
      .single();

    if (response.error) {
      setErrorMessage(response.error.message);
      setInvoice(null);
    } else {
      setInvoice(response.data as Invoice);
    }

    setIsLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  const client = useMemo(() => {
    if (!invoice) {
      return null;
    }

    return Array.isArray(invoice.clients)
      ? invoice.clients[0] ?? null
      : invoice.clients;
  }, [invoice]);

  const job = useMemo(() => {
    if (!invoice) {
      return null;
    }

    return Array.isArray(invoice.jobs)
      ? invoice.jobs[0] ?? null
      : invoice.jobs;
  }, [invoice]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <h1 className="text-3xl font-black">
          Loading Invoice…
        </h1>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="mx-auto max-w-5xl space-y-5 p-8">
        <h1 className="text-3xl font-black">
          Invoice Not Found
        </h1>

        {errorMessage && (
          <p className="font-bold text-red-700">
            {errorMessage}
          </p>
        )}

        <Link
          href="/invoices"
          className="inline-flex rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white"
        >
          Back to Invoices
        </Link>
      </main>
    );
  }

  const subtotal = invoice.subtotal ?? 0;
  const taxAmount = invoice.tax_amount ?? 0;
  const total = subtotal + taxAmount;
  const paid = invoice.amount_paid ?? 0;
  const balance = Math.max(total - paid, 0);

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-5xl flex-wrap justify-end gap-3 print:hidden">
        <Link
          href={`/invoices/${invoice.id}`}
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
        >
          Back to Invoice
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90"
        >
          Download / Print PDF
        </button>
      </div>

      <article className="mx-auto max-w-5xl bg-white p-10 shadow-xl print:max-w-none print:p-8 print:shadow-none">
        <header className="flex flex-col gap-8 border-b-4 border-gray-950 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-bakerssPink">
              Bakersss Property Services LLC
            </p>

            <h1 className="mt-3 text-4xl font-black text-gray-950">
              INVOICE
            </h1>

            <p className="mt-3 text-sm font-bold text-gray-600">
              Veteran- and family-owned property services
            </p>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-sm font-black uppercase tracking-wide text-gray-500">
              Invoice Number
            </p>

            <p className="mt-1 text-2xl font-black text-gray-950">
              {invoice.invoice_number ??
                "Unnumbered Invoice"}
            </p>

            <StatusBadge status={invoice.invoice_status} />
          </div>
        </header>

        <section className="grid gap-8 border-b py-8 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">
              Bill To
            </h2>

            <p className="mt-3 text-xl font-black text-gray-950">
              {client?.client_name ?? "Customer"}
            </p>

            {client?.email && (
              <p className="mt-1 text-sm font-bold text-gray-700">
                {client.email}
              </p>
            )}

            {client?.phone && (
              <p className="mt-1 text-sm font-bold text-gray-700">
                {client.phone}
              </p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-4">
            <DateItem
              label="Issue Date"
              value={formatDate(invoice.issue_date)}
            />

            <DateItem
              label="Due Date"
              value={formatDate(invoice.due_date)}
            />
          </dl>
        </section>

        <section className="py-8">
          <div className="overflow-hidden rounded-xl border border-gray-300">
            <table className="w-full">
              <thead className="bg-gray-950 text-white">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide">
                    Description
                  </th>

                  <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-wide">
                    Amount
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr className="border-b">
                  <td className="px-5 py-5 align-top">
                    <p className="font-black text-gray-950">
                      {job?.job_title ??
                        "Property Services"}
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {invoice.description ||
                        "Services rendered as agreed."}
                    </p>
                  </td>

                  <td className="px-5 py-5 text-right align-top text-lg font-black text-gray-950">
                    {formatCurrency(subtotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex justify-end">
          <dl className="w-full max-w-md space-y-3">
            <TotalLine
              label="Subtotal"
              value={formatCurrency(subtotal)}
            />

            <TotalLine
              label="Tax"
              value={formatCurrency(taxAmount)}
            />

            <TotalLine
              label="Invoice Total"
              value={formatCurrency(total)}
              strong
            />

            <TotalLine
              label="Payments Received"
              value={`-${formatCurrency(paid)}`}
            />

            <div className="flex items-center justify-between rounded-xl bg-gray-950 px-5 py-4 text-white">
              <dt className="text-sm font-black uppercase tracking-wide">
                Balance Due
              </dt>

              <dd className="text-2xl font-black">
                {formatCurrency(balance)}
              </dd>
            </div>
          </dl>
        </section>

        <footer className="mt-12 border-t pt-6">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-950">
            Payment Terms
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-700">
            Payment is due by {formatDate(invoice.due_date)}.
            Accepted payment methods include debit or credit
            card, ACH, Cash App, Venmo, check, and cash.
          </p>

          <p className="mt-6 text-center text-sm font-black text-gray-950">
            Thank you for choosing Bakersss Property Services LLC.
          </p>
        </footer>
      </article>
    </main>
  );
}

function DateItem({
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

      <dd className="mt-1 font-black text-gray-950">
        {value}
      </dd>
    </div>
  );
}

function TotalLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-1 py-2 ${
        strong ? "border-y-2 border-gray-950" : ""
      }`}
    >
      <dt
        className={
          strong
            ? "font-black text-gray-950"
            : "font-bold text-gray-600"
        }
      >
        {label}
      </dt>

      <dd
        className={
          strong
            ? "text-xl font-black text-gray-950"
            : "font-black text-gray-900"
        }
      >
        {value}
      </dd>
    </div>
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
      className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ${className}`}
    >
      {normalized}
    </span>
  );
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
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}