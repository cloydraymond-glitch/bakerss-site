"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase/client";

type Client = { client_name: string };
type Property = { property_name: string | null; street_address: string | null };
type RecurringBillingService = {
  id: string;
  service_name: string;
  active: boolean | null;
  billing_enabled: boolean | null;
  billing_frequency: string | null;
  billing_amount: number | null;
  next_bill_date: string | null;
  last_billed_at: string | null;
  clients: Client | Client[] | null;
  properties: Property | Property[] | null;
};

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0));
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RecurringBillingPage() {
  const [services, setServices] = useState<RecurringBillingService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "due" | "enabled" | "disabled">("due");

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    const response = await supabase
      .from("recurring_services")
      .select(`
        id,
        service_name,
        active,
        billing_enabled,
        billing_frequency,
        billing_amount,
        next_bill_date,
        last_billed_at,
        clients ( client_name ),
        properties ( property_name, street_address )
      `)
      .order("next_bill_date", { ascending: true, nullsFirst: false });

    if (response.error) {
      setErrorMessage(response.error.message);
      setServices([]);
    } else {
      setServices((response.data ?? []) as unknown as RecurringBillingService[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const enabled = services.filter((s) => s.billing_enabled === true && s.active !== false);
  const due = enabled.filter((s) => Boolean(s.next_bill_date) && (s.next_bill_date as string) <= today);
  const monthlyValue = enabled.reduce((sum, s) => sum + Number(s.billing_amount ?? 0), 0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((service) => {
      if (filter === "due" && !(service.billing_enabled && service.active !== false && service.next_bill_date && service.next_bill_date <= today)) return false;
      if (filter === "enabled" && !service.billing_enabled) return false;
      if (filter === "disabled" && service.billing_enabled) return false;
      if (!q) return true;
      const client = first(service.clients)?.client_name ?? "";
      const property = first(service.properties);
      return [service.service_name, client, property?.property_name ?? "", property?.street_address ?? ""]
        .join(" ").toLowerCase().includes(q);
    });
  }, [services, filter, search, today]);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">Billing Automation</p>
          <h1 className="mt-1 text-3xl font-black">Recurring Billing</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">Recovered recurring-billing control center. Review billing-enabled service agreements and identify accounts ready for the next billing run.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/invoices/recurring-billing/operations" className="rounded-xl border bg-white px-4 py-3 text-sm font-black hover:bg-gray-50">Operations</Link>
          <Link href="/invoices/recurring-billing/review" className="rounded-xl border bg-white px-4 py-3 text-sm font-black hover:bg-gray-50">Review</Link>
          <Link href="/invoices/recurring-billing/runs" className="rounded-xl border bg-white px-4 py-3 text-sm font-black hover:bg-gray-50">Runs</Link>
          <Link href="/invoices/recurring-billing/qa" className="rounded-xl border bg-white px-4 py-3 text-sm font-black hover:bg-gray-50">Billing QA</Link>
          <Link href="/recurring" className="rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white hover:opacity-90">Manage Recurring Services</Link>
        </div>
      </header>

      {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{errorMessage}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Billing Enabled", String(enabled.length), "Active recurring agreements"],
          ["Due Now", String(due.length), "Next bill date is today or earlier"],
          ["Configured Value", money(monthlyValue), "Current billing amounts"],
          ["Recovery Status", errorMessage ? "Needs attention" : "Connected", "Recurring billing fields"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
            <p className="mt-1 text-xs text-gray-500">{note}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["due", "enabled", "disabled", "all"] as const).map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${filter === item ? "bg-black text-white" : "bg-gray-100 text-gray-700"}`}>{item}</button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, property, or service" className="w-full rounded-xl border px-4 py-2 text-sm lg:max-w-sm" />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-600">Loading recurring billing…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-600">No recurring services match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Client / Property</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3">Next Bill</th><th className="px-4 py-3">Last Billed</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y">
                {rows.map((service) => {
                  const client = first(service.clients);
                  const property = first(service.properties);
                  const isDue = Boolean(service.billing_enabled && service.next_bill_date && service.next_bill_date <= today);
                  return <tr key={service.id} className={isDue ? "bg-amber-50/50" : ""}>
                    <td className="px-4 py-4"><p className="font-black">{client?.client_name ?? "Unassigned client"}</p><p className="text-xs text-gray-500">{property?.property_name || property?.street_address || "No property"}</p></td>
                    <td className="px-4 py-4 font-semibold">{service.service_name}</td>
                    <td className="px-4 py-4"><p className="font-black">{service.billing_enabled ? money(service.billing_amount) : "Disabled"}</p><p className="text-xs text-gray-500">{service.billing_frequency ?? "Not configured"}</p></td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-black ${isDue ? "bg-amber-200 text-amber-900" : "bg-gray-100 text-gray-700"}`}>{dateLabel(service.next_bill_date)}</span></td>
                    <td className="px-4 py-4 text-gray-600">{service.last_billed_at ? new Date(service.last_billed_at).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-4 text-right"><Link href={`/recurring/${service.id}/edit`} className="font-black text-bakerssPink">Edit Billing</Link></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
