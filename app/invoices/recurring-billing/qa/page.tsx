"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase/client";

type Check = { name: string; status: "checking" | "pass" | "fail"; detail: string };

export default function RecurringBillingQaPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(true);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const work: Array<{ name: string; run: () => Promise<{ error: { message: string } | null }> }> = [
      { name: "Recurring billing fields", run: async () => { const r = await supabase.from("recurring_services").select("id,billing_enabled,billing_frequency,billing_amount,next_bill_date,last_billed_at").limit(1); return { error: r.error }; } },
      { name: "Recurring billing runs", run: async () => { const r = await supabase.from("recurring_billing_runs").select("*").limit(1); return { error: r.error }; } },
      { name: "Collection activity", run: async () => { const r = await supabase.from("invoice_collection_activity").select("*").limit(1); return { error: r.error }; } },
      { name: "Invoice delivery activity", run: async () => { const r = await supabase.from("invoice_delivery_activity").select("*").limit(1); return { error: r.error }; } },
      { name: "Payment exceptions", run: async () => { const r = await supabase.from("payment_exception_cases").select("*").limit(1); return { error: r.error }; } },
      { name: "Customer credits", run: async () => { const r = await supabase.from("customer_credits").select("*").limit(1); return { error: r.error }; } },
      { name: "Statement delivery activity", run: async () => { const r = await supabase.from("statement_delivery_activity").select("*").limit(1); return { error: r.error }; } },
    ];

    const results: Check[] = [];
    for (const check of work) {
      try {
        const result = await check.run();
        results.push({ name: check.name, status: result.error ? "fail" : "pass", detail: result.error?.message ?? "Available" });
      } catch (error) {
        results.push({ name: check.name, status: "fail", detail: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    setChecks(results);
    setRunning(false);
  }, []);

  useEffect(() => { void runChecks(); }, [runChecks]);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return <main className="space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-black uppercase tracking-wide text-bakerssPink">Recovery / Health Check</p><h1 className="mt-1 text-3xl font-black">Billing QA</h1><p className="mt-2 text-sm text-gray-600">Confirms that the live Supabase billing structures documented in the prior master are still available.</p></div>
      <div className="flex gap-2"><Link href="/invoices/recurring-billing" className="rounded-xl border bg-white px-4 py-3 text-sm font-black">Back to Recurring Billing</Link><button onClick={() => void runChecks()} disabled={running} className="rounded-xl bg-black px-4 py-3 text-sm font-black text-white disabled:opacity-50">{running ? "Checking…" : "Run Again"}</button></div>
    </header>

    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-black uppercase text-gray-500">Checks</p><p className="mt-2 text-3xl font-black">{checks.length}</p></div>
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5"><p className="text-xs font-black uppercase text-green-700">Passed</p><p className="mt-2 text-3xl font-black text-green-900">{passed}</p></div>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><p className="text-xs font-black uppercase text-red-700">Failed</p><p className="mt-2 text-3xl font-black text-red-900">{failed}</p></div>
    </section>

    <section className="space-y-3">
      {running && checks.length === 0 && <div className="rounded-2xl border bg-white p-6 text-sm font-semibold">Running billing health checks…</div>}
      {checks.map((check) => <div key={check.name} className={`rounded-2xl border p-5 ${check.status === "pass" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}><div className="flex items-start justify-between gap-4"><div><h2 className="font-black">{check.name}</h2><p className="mt-1 text-sm text-gray-700">{check.detail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${check.status === "pass" ? "bg-green-200 text-green-900" : "bg-red-200 text-red-900"}`}>{check.status}</span></div></div>)}
    </section>
  </main>;
}
