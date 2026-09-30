"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  FormEvent,
  ReactNode,
} from "react";
import { supabase } from "../../../../lib/supabase/client";

type Client = {
  id: string;
  client_name: string;
};

type Job = {
  id: string;
  job_title: string;
  client_id: string | null;
  estimated_price: number | null;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  job_id: string | null;
  invoice_status: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  amount_paid: number | null;
  description: string | null;
  internal_notes: string | null;
};

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params.id;

  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(
    null,
  );

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientId, setClientId] = useState("");
  const [jobId, setJobId] = useState("");
  const [invoiceStatus, setInvoiceStatus] =
    useState("draft");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [description, setDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadInvoice = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const [
      invoiceResponse,
      clientsResponse,
      jobsResponse,
    ] = await Promise.all([
      supabase
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
          internal_notes
        `)
        .eq("id", invoiceId)
        .single(),

      supabase
        .from("clients")
        .select("id, client_name")
        .order("client_name", { ascending: true }),

      supabase
        .from("jobs")
        .select(`
          id,
          job_title,
          client_id,
          estimated_price
        `)
        .order("scheduled_start", {
          ascending: false,
        }),
    ]);

    const firstError =
      invoiceResponse.error ||
      clientsResponse.error ||
      jobsResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedInvoice =
      invoiceResponse.data as Invoice;

    setInvoice(loadedInvoice);
    setClients(
      (clientsResponse.data ?? []) as Client[],
    );
    setJobs((jobsResponse.data ?? []) as Job[]);

    setInvoiceNumber(
      loadedInvoice.invoice_number ?? "",
    );
    setClientId(loadedInvoice.client_id ?? "");
    setJobId(loadedInvoice.job_id ?? "");
    setInvoiceStatus(
      loadedInvoice.invoice_status ?? "draft",
    );
    setIssueDate(loadedInvoice.issue_date ?? "");
    setDueDate(loadedInvoice.due_date ?? "");
    setSubtotal(
      Number(loadedInvoice.subtotal ?? 0).toFixed(2),
    );
    setTaxAmount(
      Number(loadedInvoice.tax_amount ?? 0).toFixed(2),
    );
    setDescription(loadedInvoice.description ?? "");
    setInternalNotes(
      loadedInvoice.internal_notes ?? "",
    );

    setIsLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !clientId || job.client_id === clientId,
      ),
    [clientId, jobs],
  );

  const totalAmount =
    parseMoney(subtotal) + parseMoney(taxAmount);

  const amountPaid = invoice?.amount_paid ?? 0;

  function handleClientChange(value: string) {
    setClientId(value);

    if (
      jobId &&
      !jobs.some(
        (job) =>
          job.id === jobId &&
          (!value || job.client_id === value),
      )
    ) {
      setJobId("");
    }
  }

  function handleJobChange(value: string) {
    setJobId(value);

    const selectedJob = jobs.find(
      (job) => job.id === value,
    );

    if (!selectedJob) {
      return;
    }

    if (selectedJob.client_id) {
      setClientId(selectedJob.client_id);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!invoice) {
      return;
    }

    setErrorMessage("");

    const normalizedInvoiceNumber =
      invoiceNumber.trim();
    const normalizedSubtotal = parseMoney(subtotal);
    const normalizedTaxAmount =
      parseMoney(taxAmount);
    const newTotal =
      normalizedSubtotal + normalizedTaxAmount;

    if (!normalizedInvoiceNumber) {
      setErrorMessage("Invoice number is required.");
      return;
    }

    if (!clientId) {
      setErrorMessage("Select a client.");
      return;
    }

    if (!issueDate || !dueDate) {
      setErrorMessage(
        "Issue date and due date are required.",
      );
      return;
    }

    if (dueDate < issueDate) {
      setErrorMessage(
        "Due date cannot be earlier than issue date.",
      );
      return;
    }

    if (
      normalizedSubtotal < 0 ||
      normalizedTaxAmount < 0
    ) {
      setErrorMessage(
        "Invoice amounts cannot be negative.",
      );
      return;
    }

    if (newTotal + 0.005 < amountPaid) {
      setErrorMessage(
        "Invoice total cannot be lower than payments already recorded.",
      );
      return;
    }

    setIsSaving(true);

    const nextStatus =
      invoiceStatus === "void"
        ? "void"
        : amountPaid >= newTotal && newTotal > 0
          ? "paid"
          : amountPaid > 0
            ? "partial"
            : invoiceStatus;

    const updateResponse = await supabase
      .from("invoices")
      .update({
        invoice_number: normalizedInvoiceNumber,
        client_id: clientId,
        job_id: jobId || null,
        invoice_status: nextStatus,
        issue_date: issueDate,
        due_date: dueDate,
        subtotal: normalizedSubtotal,
        tax_amount: normalizedTaxAmount,
        description: description.trim() || null,
        internal_notes:
          internalNotes.trim() || null,
        sent_at:
          nextStatus === "sent"
            ? new Date().toISOString()
            : invoiceStatus === "sent"
              ? undefined
              : null,
      })
      .eq("id", invoice.id);

    if (updateResponse.error) {
      setErrorMessage(updateResponse.error.message);
      setIsSaving(false);
      return;
    }

    router.push(`/invoices/${invoice.id}`);
    router.refresh();
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Edit Invoice
        </h1>
        <p className="text-gray-600">
          Loading invoice…
        </p>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="space-y-6">
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

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Accounts Receivable
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Edit Invoice
          </h1>

          <p className="mt-2 text-gray-600">
            Update invoice dates, amounts, client, work
            order, description, and internal notes.
          </p>
        </div>

        <Link
          href={`/invoices/${invoice.id}`}
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
        >
          Cancel Editing
        </Link>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Invoice Information
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Invoice Number">
              <input
                type="text"
                value={invoiceNumber}
                onChange={(event) =>
                  setInvoiceNumber(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>

            <Field label="Client">
              <select
                value={clientId}
                onChange={(event) =>
                  handleClientChange(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="">Select a client</option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.client_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Work Order">
              <select
                value={jobId}
                onChange={(event) =>
                  handleJobChange(event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="">
                  No linked work order
                </option>

                {filteredJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.job_title}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                value={invoiceStatus}
                onChange={(event) =>
                  setInvoiceStatus(event.target.value)
                }
                disabled={
                  amountPaid > 0 ||
                  invoice.invoice_status === "void"
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 disabled:bg-gray-100"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </select>
            </Field>

            <Field label="Issue Date">
              <input
                type="date"
                value={issueDate}
                onChange={(event) =>
                  setIssueDate(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>

            <Field label="Due Date">
              <input
                type="date"
                value={dueDate}
                onChange={(event) =>
                  setDueDate(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Amounts
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-4">
            <Field label="Subtotal">
              <MoneyInput
                value={subtotal}
                onChange={setSubtotal}
              />
            </Field>

            <Field label="Tax Amount">
              <MoneyInput
                value={taxAmount}
                onChange={setTaxAmount}
              />
            </Field>

            <AmountCard
              label="Amount Paid"
              value={amountPaid}
            />

            <AmountCard
              label="Updated Total"
              value={totalAmount}
              dark
            />
          </div>

          {amountPaid > 0 && (
            <p className="mt-4 text-sm font-bold text-amber-700">
              The updated invoice total cannot be lower than
              the amount already paid.
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Description and Notes
          </h2>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Field label="Customer Description">
              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                rows={6}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>

            <Field label="Internal Notes">
              <textarea
                value={internalNotes}
                onChange={(event) =>
                  setInternalNotes(event.target.value)
                }
                rows={6}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href={`/invoices/${invoice.id}`}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-gray-950 px-6 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving
              ? "Saving Changes…"
              : "Save Changes"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-black">
        {label}
      </span>
      {children}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-500">
        $
      </span>

      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-gray-300 py-3 pl-8 pr-4"
      />
    </div>
  );
}

function AmountCard({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: number;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${
        dark
          ? "bg-gray-950 text-white"
          : "bg-gray-100 text-gray-950"
      }`}
    >
      <p className="text-sm font-black uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function parseMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}