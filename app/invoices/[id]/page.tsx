"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  email: string | null;
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
  internal_notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  emailed_at: string | null;
  emailed_to: string | null;
  email_subject: string | null;
  email_delivery_notes: string | null;
  reminder_status: string | null;
  last_reminder_at: string | null;
  next_follow_up_date: string | null;
  reminder_notes: string | null;
  reminder_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  clients: Client | Client[] | null;
  jobs: Job | Job[] | null;
};

type Payment = {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

const PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["check", "Check"],
  ["ach", "ACH"],
  ["credit_card", "Credit Card"],
  ["debit_card", "Debit Card"],
  ["cash_app", "Cash App"],
  ["venmo", "Venmo"],
  ["other", "Other"],
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


export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(
    null,
  );
  const [payments, setPayments] = useState<Payment[]>([]);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    getTodayInput(),
  );
  const [paymentMethod, setPaymentMethod] =
    useState("ach");
  const [referenceNumber, setReferenceNumber] =
    useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPayment, setIsSavingPayment] =
    useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const [emailRecipient, setEmailRecipient] =
    useState("");
  const [emailSubject, setEmailSubject] =
    useState("");
  const [emailNotes, setEmailNotes] = useState("");
  const [isSavingEmail, setIsSavingEmail] =
    useState(false);

  const [reminderStatus, setReminderStatus] =
    useState("not_started");
  const [nextFollowUpDate, setNextFollowUpDate] =
    useState("");
  const [reminderNotes, setReminderNotes] =
    useState("");
  const [isSavingReminder, setIsSavingReminder] =
    useState(false);

  const loadInvoice = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    await supabase.rpc("refresh_overdue_invoices");

    const [invoiceResponse, paymentResponse] =
      await Promise.all([
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
            internal_notes,
            sent_at,
            paid_at,
            voided_at,
            emailed_at,
            emailed_to,
            email_subject,
            email_delivery_notes,
            reminder_status,
            last_reminder_at,
            next_follow_up_date,
            reminder_notes,
            reminder_count,
            created_at,
            updated_at,
            clients (
              id,
              client_name,
              email
            ),
            jobs (
              id,
              job_title
            )
          `)
          .eq("id", invoiceId)
          .single(),

        supabase
          .from("invoice_payments")
          .select(`
            id,
            invoice_id,
            payment_date,
            amount,
            payment_method,
            reference_number,
            notes,
            created_at
          `)
          .eq("invoice_id", invoiceId)
          .order("payment_date", {
            ascending: false,
          })
          .order("created_at", {
            ascending: false,
          }),
      ]);

    const firstError =
      invoiceResponse.error || paymentResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setInvoice(null);
      setPayments([]);
    } else {
      const loadedInvoice =
        invoiceResponse.data as Invoice;

      setInvoice(loadedInvoice);
      setPayments(
        (paymentResponse.data ?? []) as Payment[],
      );

      const loadedClient = Array.isArray(
        loadedInvoice.clients,
      )
        ? loadedInvoice.clients[0] ?? null
        : loadedInvoice.clients;

      setEmailRecipient(
        loadedInvoice.emailed_to ??
          loadedClient?.email ??
          "",
      );
      setEmailSubject(
        loadedInvoice.email_subject ??
          `Invoice ${
            loadedInvoice.invoice_number ?? ""
          } from Bakersss Property Services LLC`,
      );
      setEmailNotes(
        loadedInvoice.email_delivery_notes ?? "",
      );

      setReminderStatus(
        loadedInvoice.reminder_status ?? "not_started",
      );
      setNextFollowUpDate(
        loadedInvoice.next_follow_up_date ?? "",
      );
      setReminderNotes(
        loadedInvoice.reminder_notes ?? "",
      );
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

  const totalAmount = useMemo(
    () =>
      (invoice?.subtotal ?? 0) +
      (invoice?.tax_amount ?? 0),
    [invoice],
  );

  const amountPaid = invoice?.amount_paid ?? 0;
  const balanceDue = Math.max(
    totalAmount - amountPaid,
    0,
  );

  function openEmailDraft() {
    if (!invoice) {
      return;
    }

    if (!emailRecipient.trim()) {
      setErrorMessage(
        "Enter a customer email address first.",
      );
      return;
    }

    setErrorMessage("");

    const printUrl = `${window.location.origin}/invoices/${invoice.id}/print`;

    const body = [
      `Hello ${client?.client_name ?? "Customer"},`,
      "",
      `Please find invoice ${
        invoice.invoice_number ?? ""
      } from Bakersss Property Services LLC.`,
      "",
      `Invoice total: ${formatCurrency(totalAmount)}`,
      `Balance due: ${formatCurrency(balanceDue)}`,
      `Due date: ${formatDate(invoice.due_date)}`,
      "",
      `View or save the invoice here: ${printUrl}`,
      "",
      "Thank you,",
      "Bakersss Property Services LLC",
    ].join("\n");

    window.location.href = `mailto:${encodeURIComponent(
      emailRecipient.trim(),
    )}?subject=${encodeURIComponent(
      emailSubject.trim(),
    )}&body=${encodeURIComponent(body)}`;
  }

  async function markAsEmailed() {
    if (!invoice) {
      return;
    }

    if (!emailRecipient.trim()) {
      setErrorMessage(
        "Enter a customer email address first.",
      );
      return;
    }

    setIsSavingEmail(true);
    setErrorMessage("");
    setSuccessMessage("");

    const now = new Date().toISOString();

    const response = await supabase
      .from("invoices")
      .update({
        emailed_at: now,
        emailed_to: emailRecipient.trim(),
        email_subject:
          emailSubject.trim() || null,
        email_delivery_notes:
          emailNotes.trim() || null,
        invoice_status:
          invoice.invoice_status === "draft"
            ? "sent"
            : invoice.invoice_status,
        sent_at:
          invoice.sent_at ?? now,
      })
      .eq("id", invoice.id);

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSavingEmail(false);
      return;
    }

    setSuccessMessage(
      "Invoice marked as emailed.",
    );
    await loadInvoice();
    setIsSavingEmail(false);
  }

  async function saveReminder() {
    if (!invoice) {
      return;
    }

    setIsSavingReminder(true);
    setErrorMessage("");
    setSuccessMessage("");

    const response = await supabase
      .from("invoices")
      .update({
        reminder_status: reminderStatus,
        next_follow_up_date:
          nextFollowUpDate || null,
        reminder_notes:
          reminderNotes.trim() || null,
      })
      .eq("id", invoice.id);

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSavingReminder(false);
      return;
    }

    setSuccessMessage(
      "Reminder details saved.",
    );
    await loadInvoice();
    setIsSavingReminder(false);
  }

  async function recordReminderContact() {
    if (!invoice) {
      return;
    }

    setIsSavingReminder(true);
    setErrorMessage("");
    setSuccessMessage("");

    const now = new Date().toISOString();
    const nextCount =
      (invoice.reminder_count ?? 0) + 1;

    const response = await supabase
      .from("invoices")
      .update({
        reminder_status:
          reminderStatus === "not_started"
            ? "contacted"
            : reminderStatus,
        last_reminder_at: now,
        next_follow_up_date:
          nextFollowUpDate || null,
        reminder_notes:
          reminderNotes.trim() || null,
        reminder_count: nextCount,
      })
      .eq("id", invoice.id);

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSavingReminder(false);
      return;
    }

    setSuccessMessage(
      "Reminder contact recorded.",
    );
    await loadInvoice();
    setIsSavingReminder(false);
  }

  async function recordPayment(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!invoice || invoice.invoice_status === "void") {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage(
        "Enter a payment amount greater than zero.",
      );
      return;
    }

    if (amount > balanceDue + 0.005) {
      setErrorMessage(
        "Payment cannot exceed the remaining balance.",
      );
      return;
    }

    setIsSavingPayment(true);

    const response = await supabase
      .from("invoice_payments")
      .insert({
        invoice_id: invoice.id,
        payment_date: paymentDate,
        amount,
        payment_method: paymentMethod,
        reference_number:
          referenceNumber.trim() || null,
        notes: paymentNotes.trim() || null,
      });

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSavingPayment(false);
      return;
    }

    setPaymentAmount("");
    setReferenceNumber("");
    setPaymentNotes("");
    setSuccessMessage("Payment recorded successfully.");

    await loadInvoice();
    setIsSavingPayment(false);
  }

  async function markAsSent() {
    if (!invoice) {
      return;
    }

    setIsUpdatingStatus(true);
    setErrorMessage("");
    setSuccessMessage("");

    const response = await supabase
      .from("invoices")
      .update({
        invoice_status: "sent",
        sent_at: invoice.sent_at ?? new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (response.error) {
      setErrorMessage(response.error.message);
    } else {
      setSuccessMessage("Invoice marked as sent.");
      await loadInvoice();
    }

    setIsUpdatingStatus(false);
  }

  async function voidInvoice() {
    if (!invoice) {
      return;
    }

    const confirmed = window.confirm(
      "Void this invoice? Existing payment history will remain visible.",
    );

    if (!confirmed) {
      return;
    }

    setIsUpdatingStatus(true);
    setErrorMessage("");
    setSuccessMessage("");

    const response = await supabase
      .from("invoices")
      .update({
        invoice_status: "void",
        voided_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (response.error) {
      setErrorMessage(response.error.message);
    } else {
      setSuccessMessage("Invoice voided.");
      await loadInvoice();
    }

    setIsUpdatingStatus(false);
  }

  async function restoreInvoice() {
    if (!invoice) {
      return;
    }

    setIsUpdatingStatus(true);
    setErrorMessage("");
    setSuccessMessage("");

    const restoredStatus =
      balanceDue <= 0
        ? "paid"
        : amountPaid > 0
          ? "partial"
          : invoice.due_date &&
              invoice.due_date < getTodayInput()
            ? "overdue"
            : "sent";

    const response = await supabase
      .from("invoices")
      .update({
        invoice_status: restoredStatus,
        voided_at: null,
      })
      .eq("id", invoice.id);

    if (response.error) {
      setErrorMessage(response.error.message);
    } else {
      setSuccessMessage("Invoice restored.");
      await loadInvoice();
    }

    setIsUpdatingStatus(false);
  }

  async function deletePayment(payment: Payment) {
    const confirmed = window.confirm(
      `Delete the ${formatCurrency(
        payment.amount,
      )} payment recorded on ${formatDate(
        payment.payment_date,
      )}?`,
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const response = await supabase
      .from("invoice_payments")
      .delete()
      .eq("id", payment.id);

    if (response.error) {
      setErrorMessage(response.error.message);
      return;
    }

    setSuccessMessage("Payment deleted.");
    await loadInvoice();
  }

  if (isLoading) {
    return (
      <main className="space-y-6 print:space-y-4 print:bg-white print:text-black">
        <h1 className="text-3xl font-black">
          Invoice Detail
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
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Accounts Receivable
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black">
              {invoice.invoice_number ??
                "Unnumbered Invoice"}
            </h1>

            <StatusBadge status={invoice.invoice_status} />
          </div>

          <p className="mt-2 text-gray-600">
            Issued {formatDate(invoice.issue_date)} · Due{" "}
            {formatDate(invoice.due_date)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 print:hidden">
          <Link
            href="/invoices"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Back to Invoices
          </Link>

          <Link
            href={`/invoices/${invoice.id}/edit`}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Edit Invoice
          </Link>

          <Link
            href={`/invoices/${invoice.id}/print`}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Customer PDF
          </Link>

          <button
            type="button"
            onClick={openEmailDraft}
            className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Email Invoice
          </button>

          {invoice.invoice_status === "draft" && (
            <button
              type="button"
              onClick={markAsSent}
              disabled={isUpdatingStatus}
              className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
            >
              Mark as Sent
            </button>
          )}

          {invoice.invoice_status === "void" ? (
            <button
              type="button"
              onClick={restoreInvoice}
              disabled={isUpdatingStatus}
              className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
            >
              Restore Invoice
            </button>
          ) : (
            <button
              type="button"
              onClick={voidInvoice}
              disabled={isUpdatingStatus}
              className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
            >
              Void Invoice
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Print
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {successMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Invoice Total"
          value={formatCurrency(totalAmount)}
          note={`${formatCurrency(
            invoice.subtotal ?? 0,
          )} subtotal + ${formatCurrency(
            invoice.tax_amount ?? 0,
          )} tax`}
        />

        <SummaryCard
          title="Paid"
          value={formatCurrency(amountPaid)}
          note={`${payments.length} payment${
            payments.length === 1 ? "" : "s"
          }`}
        />

        <SummaryCard
          title="Balance Due"
          value={formatCurrency(balanceDue)}
          note={
            balanceDue <= 0
              ? "Paid in full"
              : `Due ${formatDate(invoice.due_date)}`
          }
          warning={
            invoice.invoice_status === "overdue" &&
            balanceDue > 0
          }
        />

        <SummaryCard
          title="Collection"
          value={
            totalAmount > 0
              ? `${(
                  (amountPaid / totalAmount) *
                  100
                ).toFixed(1)}%`
              : "—"
          }
          note="Paid divided by invoice total"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2 print:block">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Invoice Information
          </h2>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailItem label="Client">
              {client ? (
                <Link
                  href={`/customers/${client.id}`}
                  className="font-black hover:text-bakerssPink"
                >
                  {client.client_name}
                </Link>
              ) : (
                "—"
              )}
            </DetailItem>

            <DetailItem label="Work Order">
              {job ? (
                <Link
                  href={`/work-orders/${job.id}`}
                  className="font-black hover:text-bakerssPink"
                >
                  {job.job_title}
                </Link>
              ) : (
                "—"
              )}
            </DetailItem>

            <DetailItem label="Issue Date">
              {formatDate(invoice.issue_date)}
            </DetailItem>

            <DetailItem label="Due Date">
              {formatDate(invoice.due_date)}
            </DetailItem>

            <DetailItem label="Sent">
              {formatDateTime(invoice.sent_at)}
            </DetailItem>

            <DetailItem label="Paid">
              {formatDateTime(invoice.paid_at)}
            </DetailItem>
          </dl>

          <div className="mt-6 space-y-5">
            <TextSection
              title="Customer Description"
              value={invoice.description}
            />

            <TextSection
              title="Internal Notes"
              value={invoice.internal_notes}
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm print:hidden">
          <h2 className="text-xl font-black">
            Record Payment
          </h2>

          {invoice.invoice_status === "void" ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              Restore this invoice before recording a payment.
            </div>
          ) : balanceDue <= 0 ? (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900">
              This invoice is paid in full.
            </div>
          ) : (
            <form
              onSubmit={recordPayment}
              className="mt-5 space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Payment Amount">
                  <MoneyInput
                    value={paymentAmount}
                    onChange={setPaymentAmount}
                    max={balanceDue}
                  />
                </Field>

                <Field label="Payment Date">
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(event) =>
                      setPaymentDate(event.target.value)
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  />
                </Field>

                <Field label="Payment Method">
                  <select
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                  >
                    {PAYMENT_METHODS.map(
                      ([value, label]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Reference Number">
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(event) =>
                      setReferenceNumber(
                        event.target.value,
                      )
                    }
                    placeholder="Check, ACH, or transaction ID"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  />
                </Field>
              </div>

              <Field label="Payment Notes">
                <textarea
                  value={paymentNotes}
                  onChange={(event) =>
                    setPaymentNotes(event.target.value)
                  }
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </Field>

              <div className="flex flex-wrap justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setPaymentAmount(
                      balanceDue.toFixed(2),
                    )
                  }
                  className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
                >
                  Use Full Balance
                </button>

                <button
                  type="submit"
                  disabled={isSavingPayment}
                  className="rounded-xl bg-green-700 px-6 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isSavingPayment
                    ? "Recording…"
                    : "Record Payment"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black">
              Collections Follow-Up
            </h2>

            <p className="mt-1 text-sm font-bold text-gray-500">
              Track reminder status, notes, and the next
              collection follow-up date.
            </p>
          </div>

          <div className="text-sm font-bold text-gray-600">
            Last reminder:{" "}
            {formatDateTime(invoice.last_reminder_at)}
            {" · "}
            Count: {invoice.reminder_count ?? 0}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Field label="Reminder Status">
            <select
              value={reminderStatus}
              onChange={(event) =>
                setReminderStatus(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              {REMINDER_STATUSES.map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field label="Next Follow-Up Date">
            <input
              type="date"
              value={nextFollowUpDate}
              onChange={(event) =>
                setNextFollowUpDate(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Reminder Notes">
            <textarea
              value={reminderNotes}
              onChange={(event) =>
                setReminderNotes(event.target.value)
              }
              rows={5}
              placeholder="Document calls, emails, promises to pay, disputes, or escalation details."
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={saveReminder}
            disabled={isSavingReminder}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {isSavingReminder
              ? "Saving…"
              : "Save Follow-Up"}
          </button>

          <button
            type="button"
            onClick={recordReminderContact}
            disabled={isSavingReminder}
            className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSavingReminder
              ? "Recording…"
              : "Record Reminder Contact"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black">
              Email Delivery
            </h2>

            <p className="mt-1 text-sm font-bold text-gray-500">
              Prepare the customer email and record when the
              invoice was delivered.
            </p>
          </div>

          <div className="text-sm font-bold text-gray-600">
            Last emailed:{" "}
            {formatDateTime(invoice.emailed_at)}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Field label="Recipient Email">
            <input
              type="email"
              value={emailRecipient}
              onChange={(event) =>
                setEmailRecipient(event.target.value)
              }
              placeholder="customer@example.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </Field>

          <Field label="Email Subject">
            <input
              type="text"
              value={emailSubject}
              onChange={(event) =>
                setEmailSubject(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Delivery Notes">
            <textarea
              value={emailNotes}
              onChange={(event) =>
                setEmailNotes(event.target.value)
              }
              rows={4}
              placeholder="Optional internal notes about delivery or follow-up."
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={openEmailDraft}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Open Email Draft
          </button>

          <button
            type="button"
            onClick={markAsEmailed}
            disabled={isSavingEmail}
            className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSavingEmail
              ? "Saving…"
              : "Mark as Emailed"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm print:hidden">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Payment History
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Date",
                  "Amount",
                  "Method",
                  "Reference",
                  "Notes",
                  "Action",
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
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatDate(payment.payment_date)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-gray-950">
                    {formatCurrency(payment.amount)}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {formatPaymentMethod(
                      payment.payment_method,
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-800">
                    {payment.reference_number ?? "—"}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-gray-700">
                    {payment.notes ?? "—"}
                  </td>

                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() =>
                        void deletePayment(payment)
                      }
                      className="text-sm font-black text-red-700 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {payments.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm font-bold text-gray-500"
                  >
                    No payments have been recorded.
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

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </dt>

      <dd className="mt-1 text-sm font-bold text-gray-900">
        {children}
      </dd>
    </div>
  );
}

function TextSection({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return (
    <div>
      <h3 className="text-sm font-black text-gray-950">
        {title}
      </h3>

      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
        {value || "—"}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  max: number;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-500">
        $
      </span>

      <input
        type="number"
        min="0.01"
        max={max.toFixed(2)}
        step="0.01"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        required
        className="w-full rounded-xl border border-gray-300 py-3 pl-8 pr-4"
      />
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
      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${className}`}
    >
      {normalized}
    </span>
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
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatPaymentMethod(value: string) {
  return (
    PAYMENT_METHODS.find(
      ([method]) => method === value,
    )?.[1] ??
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) =>
        character.toUpperCase(),
      )
  );
}