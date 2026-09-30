"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { supabase } from "../../../lib/supabase/client";

type Category = { id: string; category_name: string };
type Client = { id: string; client_name: string };
type Job = { id: string; job_title: string; client_id: string | null };

export default function NewExpensePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expenseDate, setExpenseDate] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("debit_card");
  const [clientId, setClientId] = useState("");
  const [jobId, setJobId] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [categoryResponse, clientResponse, jobResponse] = await Promise.all([
        supabase.from("expense_categories").select("id, category_name").eq("is_active", true).order("category_name"),
        supabase.from("clients").select("id, client_name").order("client_name"),
        supabase.from("jobs").select("id, job_title, client_id").order("scheduled_start", { ascending: false }),
      ]);

      const firstError = categoryResponse.error || clientResponse.error || jobResponse.error;

      if (firstError) setError(firstError.message);
      else {
        setCategories((categoryResponse.data ?? []) as Category[]);
        setClients((clientResponse.data ?? []) as Client[]);
        setJobs((jobResponse.data ?? []) as Job[]);
      }

      setLoading(false);
    }

    void load();
  }, []);

  const filteredJobs = useMemo(
    () => jobs.filter((job) => !clientId || job.client_id === clientId),
    [jobs, clientId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!categoryId) return setError("Select an expense category.");
    if (!description.trim()) return setError("Description is required.");

    setSaving(true);

    const response = await supabase.from("expenses").insert({
      category_id: categoryId,
      client_id: clientId || null,
      job_id: jobId || null,
      expense_date: expenseDate,
      vendor_name: vendorName.trim() || null,
      description: description.trim(),
      amount: numberValue(amount),
      tax_amount: numberValue(taxAmount),
      payment_method: paymentMethod,
      is_recurring: isRecurring,
      recurring_frequency: isRecurring && frequency ? frequency : null,
      receipt_url: receiptUrl.trim() || null,
      reference_number: referenceNumber.trim() || null,
      internal_notes: notes.trim() || null,
    });

    if (response.error) {
      setError(response.error.message);
      setSaving(false);
      return;
    }

    router.push("/expenses");
    router.refresh();
  }

  if (loading) return <main className="space-y-6"><h1 className="text-3xl font-black">New Expense</h1><p>Loading expense form…</p></main>;

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">Financial Operations</p>
          <h1 className="mt-1 text-3xl font-black">New Expense</h1>
          <p className="mt-2 text-gray-600">Record an operating expense and optionally connect it to a client or work order.</p>
        </div>
        <Link href="/expenses" className="rounded-xl border bg-white px-5 py-3 text-sm font-black">Back to Expenses</Link>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">{error}</div>}

      <form onSubmit={submit} className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Expense Information</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Expense Date"><input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
            <Field label="Category">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border bg-white px-4 py-3">
                <option value="">Select a category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.category_name}</option>)}
              </select>
            </Field>
            <Field label="Vendor"><input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
            <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
            <Field label="Payment Method">
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-xl border bg-white px-4 py-3">
                <option value="cash">Cash</option><option value="check">Check</option><option value="ach">ACH</option><option value="credit_card">Credit Card</option><option value="debit_card">Debit Card</option><option value="cash_app">Cash App</option><option value="venmo">Venmo</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Reference Number"><input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Amounts</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} /></Field>
            <Field label="Tax"><MoneyInput value={taxAmount} onChange={setTaxAmount} /></Field>
            <div className="rounded-2xl bg-gray-950 p-5 text-white"><p className="text-sm font-black uppercase tracking-wide text-gray-300">Total</p><p className="mt-2 text-3xl font-black">{money(numberValue(amount) + numberValue(taxAmount))}</p></div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Optional Connections</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Client">
              <select value={clientId} onChange={(e) => { setClientId(e.target.value); setJobId(""); }} className="w-full rounded-xl border bg-white px-4 py-3">
                <option value="">No client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.client_name}</option>)}
              </select>
            </Field>
            <Field label="Work Order">
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full rounded-xl border bg-white px-4 py-3">
                <option value="">No work order</option>
                {filteredJobs.map((job) => <option key={job.id} value={job.id}>{job.job_title}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Recurring and Notes</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border p-4">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
              <span className="font-black">Recurring expense</span>
            </label>
            <Field label="Frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} disabled={!isRecurring} className="w-full rounded-xl border bg-white px-4 py-3 disabled:bg-gray-100">
                <option value="">Select frequency</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
              </select>
            </Field>
            <Field label="Receipt URL"><input type="url" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
            <Field label="Internal Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-xl border px-4 py-3" /></Field>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/expenses" className="rounded-xl border bg-white px-5 py-3 text-sm font-black">Cancel</Link>
          <button type="submit" disabled={saving} className="rounded-xl bg-gray-950 px-6 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving Expense…" : "Save Expense"}</button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="mb-2 block text-sm font-black">{label}</span>{children}</label>;
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-500">$</span><input type="number" min="0" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border py-3 pl-8 pr-4" /></div>;
}

function numberValue(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}