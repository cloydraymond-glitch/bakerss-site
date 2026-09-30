"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Column = {
  key: string;
  label: string;
  format?: "money" | "date" | "datetime" | "status" | "text";
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  tableName: string;
  columns: Column[];
  orderBy?: string;
  ascending?: boolean;
  emptyText?: string;
  backHref?: string;
  backLabel?: string;
  rowHref?: (row: Record<string, unknown>) => string | null;
};

function money(value: unknown) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(n) ? n : 0);
}

function dateText(value: unknown, includeTime = false) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return includeTime ? d.toLocaleString() : d.toLocaleDateString();
}

function valueText(row: Record<string, unknown>, column: Column) {
  const value = row[column.key];
  if (column.format === "money") return money(value);
  if (column.format === "date") return dateText(value);
  if (column.format === "datetime") return dateText(value, true);
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function BillingTablePage({
  eyebrow,
  title,
  description,
  tableName,
  columns,
  orderBy = "created_at",
  ascending = false,
  emptyText = "No records found.",
  backHref = "/invoices",
  backLabel = "Back to Invoices",
  rowHref,
}: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase.from(tableName).select("*");
    if (orderBy) query = query.order(orderBy, { ascending });
    const response = await query.limit(500);
    if (response.error) {
      setRows([]);
      setError(response.error.message);
    } else {
      setRows((response.data ?? []) as Record<string, unknown>[]);
    }
    setLoading(false);
  }, [ascending, orderBy, tableName]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q)));
  }, [columns, rows, search]);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={backHref} className="rounded-xl border bg-white px-4 py-3 text-sm font-black hover:bg-gray-50">{backLabel}</Link>
          <button onClick={() => void load()} className="rounded-xl bg-black px-4 py-3 text-sm font-black text-white">Refresh</button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-black uppercase text-gray-500">Records</p><p className="mt-2 text-3xl font-black">{rows.length}</p></div>
        <div className="rounded-2xl border bg-white p-5 sm:col-span-2"><label className="text-xs font-black uppercase text-gray-500">Search</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this queue" className="mt-2 w-full rounded-xl border px-4 py-3 text-sm" /></div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-600">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-600">{emptyText}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{columns.map((c) => <th key={c.key} className="px-4 py-3">{c.label}</th>)}{rowHref && <th className="px-4 py-3"></th>}</tr></thead>
              <tbody className="divide-y">
                {filtered.map((row, index) => {
                  const href = rowHref?.(row) ?? null;
                  return <tr key={String(row.id ?? index)}>{columns.map((c) => <td key={c.key} className="max-w-xs px-4 py-4 align-top"><span className={c.format === "status" ? "rounded-full bg-gray-100 px-2 py-1 text-xs font-black uppercase text-gray-700" : ""}>{valueText(row, c)}</span></td>)}{rowHref && <td className="px-4 py-4 text-right">{href && <Link href={href} className="font-black text-bakerssPink">Open</Link>}</td>}</tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
