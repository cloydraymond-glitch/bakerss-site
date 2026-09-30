"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Category = { id: string; category_name: string; expense_type: string };
type Expense = {
  id: string;
  expense_date: string;
  vendor_name: string | null;
  description: string;
  amount: number;
  tax_amount: number;
  payment_method: string;
  is_recurring: boolean;
  recurring_frequency: string | null;
  expense_categories: Category | Category[] | null;
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(today());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");

    const response = await supabase
      .from("expenses")
      .select(`
        id,
        expense_date,
        vendor_name,
        description,
        amount,
        tax_amount,
        payment_method,
        is_recurring,
        recurring_frequency,
        expense_categories (
          id,
          category_name,
          expense_type
        )
      `)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: false });

    if (response.error) {
      setError(response.error.message);
      setExpenses([]);
    } else {
      setExpenses((response.data ?? []) as Expense[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [startDate, endDate]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => expenses.map((expense) => {
    const category = Array.isArray(expense.expense_categories)
      ? expense.expense_categories[0] ?? null
      : expense.expense_categories;

    return {
      expense,
      category,
      total: Number(expense.amount ?? 0) + Number(expense.tax_amount ?? 0),
    };
  }), [expenses]);

  const categories = useMemo(() => {
    const map = new Map<string, Category>();
    for (const row of rows) if (row.category) map.set(row.category.id, row.category);
    return Array.from(map.values()).sort((a, b) =>
      a.category_name.localeCompare(b.category_name),
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const categoryMatch =
        categoryFilter === "all" || row.category?.id === categoryFilter;

      const searchMatch =
        !query ||
        [
          row.expense.vendor_name ?? "",
          row.expense.description,
          row.category?.category_name ?? "",
        ].join(" ").toLowerCase().includes(query);

      return categoryMatch && searchMatch;
    });
  }, [rows, categoryFilter, search]);

  const totals = useMemo(() => filteredRows.reduce((result, row) => {
    result.total += row.total;
    const type = row.category?.expense_type ?? "other";

    if (type === "payroll") result.payroll += row.total;
    else if (type === "materials") result.materials += row.total;
    else if (type === "fuel") result.fuel += row.total;
    else if (type === "insurance") result.insurance += row.total;
    else if (type === "software") result.software += row.total;
    else result.other += row.total;

    return result;
  }, {
    total: 0,
    payroll: 0,
    materials: 0,
    fuel: 0,
    insurance: 0,
    software: 0,
    other: 0,
  }), [filteredRows]);

  if (loading) {
    return <main className="space-y-6"><h1 className="text-3xl font-black">Expenses</h1><p>Loading expenses…</p></main>;
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">Financial Operations</p>
          <h1 className="mt-1 text-3xl font-black">Expenses & Overhead</h1>
          <p className="mt-2 text-gray-600">Track payroll, materials, fuel, insurance, software, and operating expenses.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            href="/expenses/new"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white"
          >
            New Expense
          </Link>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card title="Total Expenses" value={money(totals.total)} />
        <Card title="Payroll" value={money(totals.payroll)} />
        <Card title="Materials" value={money(totals.materials)} />
        <Card title="Fuel" value={money(totals.fuel)} />
        <Card title="Insurance" value={money(totals.insurance)} />
        <Card title="Other Overhead" value={money(totals.software + totals.other)} />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Start Date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
          <Field label="End Date"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border px-4 py-3" /></Field>
          <Field label="Category">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full rounded-xl border bg-white px-4 py-3">
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.category_name}</option>)}
            </select>
          </Field>
          <Field label="Search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vendor or description" className="w-full rounded-xl border px-4 py-3" /></Field>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">Expense Detail</h2>
          <p className="mt-1 text-sm font-bold text-gray-500">Showing {filteredRows.length} matching expenses.</p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y">
            <thead className="bg-gray-50">
              <tr>
                {["Date", "Vendor", "Description", "Category", "Payment", "Recurring", "Amount", "Tax", "Total"].map((heading) => (
                  <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((row) => (
                <tr key={row.expense.id}>
                  <td className="px-5 py-4 text-sm font-bold">{dateLabel(row.expense.expense_date)}</td>
                  <td className="px-5 py-4 text-sm font-black">{row.expense.vendor_name ?? "—"}</td>
                  <td className="px-5 py-4 text-sm font-bold">
                    <Link
                      href={`/expenses/${row.expense.id}`}
                      className="font-black text-gray-950 hover:text-bakerssPink"
                    >
                      {row.expense.description}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm font-bold">{row.category?.category_name ?? "Uncategorized"}</td>
                  <td className="px-5 py-4 text-sm font-bold capitalize">{row.expense.payment_method.replaceAll("_", " ")}</td>
                  <td className="px-5 py-4 text-sm font-bold">{row.expense.is_recurring ? row.expense.recurring_frequency ?? "Yes" : "No"}</td>
                  <td className="px-5 py-4 text-sm font-black">{money(row.expense.amount)}</td>
                  <td className="px-5 py-4 text-sm font-black">{money(row.expense.tax_amount)}</td>
                  <td className="px-5 py-4 text-sm font-black">{money(row.total)}</td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-bold text-gray-500">No expenses match the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-black text-gray-500">{title}</p><p className="mt-2 text-2xl font-black">{value}</p></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-2 block text-sm font-black">{label}</span>{children}</label>;
}

function monthStart() {
  const now = new Date();
  return dateInput(new Date(now.getFullYear(), now.getMonth(), 1));
}

function today() { return dateInput(new Date()); }

function dateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}