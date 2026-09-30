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
import { supabase } from "../../../lib/supabase/client";

type Category = {
  id: string;
  category_name: string;
};

type Client = {
  id: string;
  client_name: string;
};

type Job = {
  id: string;
  job_title: string;
  client_id: string | null;
};

type Expense = {
  id: string;
  category_id: string | null;
  client_id: string | null;
  job_id: string | null;
  expense_date: string;
  vendor_name: string | null;
  description: string;
  amount: number;
  tax_amount: number;
  payment_method: string;
  recurring_frequency: string | null;
  is_recurring: boolean;
  receipt_url: string | null;
  reference_number: string | null;
  internal_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
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

const FREQUENCIES = [
  ["weekly", "Weekly"],
  ["biweekly", "Biweekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annual", "Annual"],
] as const;

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const expenseId = params.id;

  const [expense, setExpense] = useState<Expense | null>(
    null,
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [categoryId, setCategoryId] = useState("");
  const [clientId, setClientId] = useState("");
  const [jobId, setJobId] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] =
    useState("debit_card");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [referenceNumber, setReferenceNumber] =
    useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const loadExpense = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const [
      expenseResponse,
      categoryResponse,
      clientResponse,
      jobResponse,
    ] = await Promise.all([
      supabase
        .from("expenses")
        .select(`
          id,
          category_id,
          client_id,
          job_id,
          expense_date,
          vendor_name,
          description,
          amount,
          tax_amount,
          payment_method,
          recurring_frequency,
          is_recurring,
          receipt_url,
          reference_number,
          internal_notes,
          created_at,
          updated_at
        `)
        .eq("id", expenseId)
        .single(),

      supabase
        .from("expense_categories")
        .select("id, category_name")
        .eq("is_active", true)
        .order("category_name"),

      supabase
        .from("clients")
        .select("id, client_name")
        .order("client_name"),

      supabase
        .from("jobs")
        .select("id, job_title, client_id")
        .order("scheduled_start", {
          ascending: false,
        }),
    ]);

    const firstError =
      expenseResponse.error ||
      categoryResponse.error ||
      clientResponse.error ||
      jobResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setExpense(null);
      setIsLoading(false);
      return;
    }

    const loadedExpense =
      expenseResponse.data as Expense;

    setExpense(loadedExpense);
    setCategories(
      (categoryResponse.data ?? []) as Category[],
    );
    setClients(
      (clientResponse.data ?? []) as Client[],
    );
    setJobs((jobResponse.data ?? []) as Job[]);

    setCategoryId(loadedExpense.category_id ?? "");
    setClientId(loadedExpense.client_id ?? "");
    setJobId(loadedExpense.job_id ?? "");
    setExpenseDate(loadedExpense.expense_date);
    setVendorName(loadedExpense.vendor_name ?? "");
    setDescription(loadedExpense.description);
    setAmount(
      Number(loadedExpense.amount ?? 0).toFixed(2),
    );
    setTaxAmount(
      Number(loadedExpense.tax_amount ?? 0).toFixed(2),
    );
    setPaymentMethod(
      loadedExpense.payment_method ?? "other",
    );
    setIsRecurring(loadedExpense.is_recurring);
    setFrequency(
      loadedExpense.recurring_frequency ?? "",
    );
    setReceiptUrl(loadedExpense.receipt_url ?? "");
    setReferenceNumber(
      loadedExpense.reference_number ?? "",
    );
    setNotes(loadedExpense.internal_notes ?? "");

    setIsLoading(false);
  }, [expenseId]);

  useEffect(() => {
    void loadExpense();
  }, [loadExpense]);

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !clientId || job.client_id === clientId,
      ),
    [clientId, jobs],
  );

  const total =
    parseMoney(amount) + parseMoney(taxAmount);

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

    if (selectedJob?.client_id) {
      setClientId(selectedJob.client_id);
    }
  }

  async function saveExpense(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!expense) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    if (!categoryId) {
      setErrorMessage("Select an expense category.");
      return;
    }

    if (!description.trim()) {
      setErrorMessage("Description is required.");
      return;
    }

    const normalizedAmount = parseMoney(amount);
    const normalizedTax = parseMoney(taxAmount);

    if (normalizedAmount < 0 || normalizedTax < 0) {
      setErrorMessage(
        "Expense amounts cannot be negative.",
      );
      return;
    }

    if (isRecurring && !frequency) {
      setErrorMessage(
        "Select a recurring frequency.",
      );
      return;
    }

    setIsSaving(true);

    const response = await supabase
      .from("expenses")
      .update({
        category_id: categoryId,
        client_id: clientId || null,
        job_id: jobId || null,
        expense_date: expenseDate,
        vendor_name: vendorName.trim() || null,
        description: description.trim(),
        amount: normalizedAmount,
        tax_amount: normalizedTax,
        payment_method: paymentMethod,
        is_recurring: isRecurring,
        recurring_frequency:
          isRecurring && frequency
            ? frequency
            : null,
        receipt_url: receiptUrl.trim() || null,
        reference_number:
          referenceNumber.trim() || null,
        internal_notes: notes.trim() || null,
      })
      .eq("id", expense.id);

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage("Expense updated successfully.");
    await loadExpense();
    setIsSaving(false);
  }

  async function deleteExpense() {
    if (!expense) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this expense permanently? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage("");

    const response = await supabase
      .from("expenses")
      .delete()
      .eq("id", expense.id);

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsDeleting(false);
      return;
    }

    router.push("/expenses");
    router.refresh();
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Expense Detail
        </h1>
        <p className="text-gray-600">
          Loading expense…
        </p>
      </main>
    );
  }

  if (!expense) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Expense Not Found
        </h1>

        {errorMessage && (
          <p className="font-bold text-red-700">
            {errorMessage}
          </p>
        )}

        <Link
          href="/expenses"
          className="inline-flex rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white"
        >
          Back to Expenses
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Financial Operations
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Expense Detail
          </h1>

          <p className="mt-2 text-gray-600">
            Review, edit, or delete this expense record.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/expenses"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Back to Expenses
          </Link>

          <button
            type="button"
            onClick={deleteExpense}
            disabled={isDeleting}
            className="rounded-xl bg-red-700 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete Expense"}
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

      <form
        onSubmit={saveExpense}
        className="space-y-6"
      >
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Expense Information
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Expense Date">
              <input
                type="date"
                value={expenseDate}
                onChange={(event) =>
                  setExpenseDate(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>

            <Field label="Category">
              <select
                value={categoryId}
                onChange={(event) =>
                  setCategoryId(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="">Select category</option>

                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.category_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Vendor">
              <input
                type="text"
                value={vendorName}
                onChange={(event) =>
                  setVendorName(event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>

            <Field label="Client">
              <select
                value={clientId}
                onChange={(event) =>
                  handleClientChange(event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="">No linked client</option>

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
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>

          <div className="mt-5">
            <Field label="Description">
              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                rows={4}
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

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <Field label="Amount">
              <MoneyInput
                value={amount}
                onChange={setAmount}
              />
            </Field>

            <Field label="Tax Amount">
              <MoneyInput
                value={taxAmount}
                onChange={setTaxAmount}
              />
            </Field>

            <div className="rounded-2xl bg-gray-950 p-5 text-white">
              <p className="text-sm font-black uppercase tracking-wide text-gray-300">
                Total Expense
              </p>

              <p className="mt-2 text-3xl font-black">
                {formatCurrency(total)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Recurring Expense
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-gray-300 p-4">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(event) => {
                  setIsRecurring(event.target.checked);

                  if (!event.target.checked) {
                    setFrequency("");
                  }
                }}
                className="h-5 w-5"
              />

              <span className="font-black">
                This is a recurring expense
              </span>
            </label>

            <Field label="Frequency">
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value)
                }
                disabled={!isRecurring}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 disabled:bg-gray-100"
              >
                <option value="">
                  Select frequency
                </option>

                {FREQUENCIES.map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Documentation
          </h2>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Field label="Receipt URL">
              <input
                type="url"
                value={receiptUrl}
                onChange={(event) =>
                  setReceiptUrl(event.target.value)
                }
                placeholder="https://..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
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
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>
          </div>

          <div className="mt-5">
            <Field label="Internal Notes">
              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                rows={5}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>
          </div>

          {receiptUrl && (
            <div className="mt-5">
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
              >
                Open Receipt
              </a>
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href="/expenses"
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