"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type MonthlyBudget = {
  id: string;
  budget_month: string;
  revenue_target: number | null;
  payroll_budget: number | null;
  materials_budget: number | null;
  fuel_budget: number | null;
  vehicle_budget: number | null;
  equipment_budget: number | null;
  insurance_budget: number | null;
  software_budget: number | null;
  marketing_budget: number | null;
  tax_budget: number | null;
  other_overhead_budget: number | null;
  direct_cost_budget: number | null;
  overhead_budget: number | null;
  total_expense_budget: number | null;
  net_profit_budget: number | null;
  net_margin_target: number | null;
  notes: string | null;
};

type Invoice = {
  id: string;
  invoice_date: string;
  total_amount: number | null;
  invoice_status: string | null;
};

type ExpenseCategory = {
  id: string;
  category_name: string;
  expense_type: string;
};

type Expense = {
  id: string;
  expense_date: string;
  total_amount: number | null;
  expense_categories:
    | ExpenseCategory
    | ExpenseCategory[]
    | null;
};

type BudgetForm = {
  revenue_target: string;
  payroll_budget: string;
  materials_budget: string;
  fuel_budget: string;
  vehicle_budget: string;
  equipment_budget: string;
  insurance_budget: string;
  software_budget: string;
  marketing_budget: string;
  tax_budget: string;
  other_overhead_budget: string;
  net_margin_target: string;
  notes: string;
};

const EMPTY_FORM: BudgetForm = {
  revenue_target: "0",
  payroll_budget: "0",
  materials_budget: "0",
  fuel_budget: "0",
  vehicle_budget: "0",
  equipment_budget: "0",
  insurance_budget: "0",
  software_budget: "0",
  marketing_budget: "0",
  tax_budget: "0",
  other_overhead_budget: "0",
  net_margin_target: "18",
  notes: "",
};

export default function BudgetActualsPage() {
  const [selectedMonth, setSelectedMonth] = useState(
    getCurrentMonthInput(),
  );
  const [budget, setBudget] = useState<MonthlyBudget | null>(
    null,
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] =
    useState<BudgetForm>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const monthStart = `${selectedMonth}-01`;
    const monthEnd = getMonthEndInput(selectedMonth);

    const [
      budgetResponse,
      invoiceResponse,
      expenseResponse,
    ] = await Promise.all([
      supabase
        .from("monthly_budget_totals")
        .select("*")
        .eq("budget_month", monthStart)
        .maybeSingle(),

      supabase
        .from("invoices")
        .select(`
          id,
          invoice_date,
          total_amount,
          invoice_status
        `)
        .gte("invoice_date", monthStart)
        .lte("invoice_date", monthEnd)
        .not(
          "invoice_status",
          "in",
          '("void","voided","cancelled","canceled","draft")',
        ),

      supabase
        .from("expenses")
        .select(`
          id,
          expense_date,
          total_amount,
          expense_categories (
            id,
            category_name,
            expense_type
          )
        `)
        .gte("expense_date", monthStart)
        .lte("expense_date", monthEnd),
    ]);

    const firstError =
      budgetResponse.error ||
      invoiceResponse.error ||
      expenseResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setBudget(null);
      setInvoices([]);
      setExpenses([]);
      setIsLoading(false);
      return;
    }

    const loadedBudget =
      (budgetResponse.data ?? null) as MonthlyBudget | null;

    setBudget(loadedBudget);
    setInvoices(
      (invoiceResponse.data ?? []) as Invoice[],
    );
    setExpenses(
      (expenseResponse.data ?? []) as Expense[],
    );

    if (loadedBudget) {
      setForm({
        revenue_target: moneyInput(
          loadedBudget.revenue_target,
        ),
        payroll_budget: moneyInput(
          loadedBudget.payroll_budget,
        ),
        materials_budget: moneyInput(
          loadedBudget.materials_budget,
        ),
        fuel_budget: moneyInput(
          loadedBudget.fuel_budget,
        ),
        vehicle_budget: moneyInput(
          loadedBudget.vehicle_budget,
        ),
        equipment_budget: moneyInput(
          loadedBudget.equipment_budget,
        ),
        insurance_budget: moneyInput(
          loadedBudget.insurance_budget,
        ),
        software_budget: moneyInput(
          loadedBudget.software_budget,
        ),
        marketing_budget: moneyInput(
          loadedBudget.marketing_budget,
        ),
        tax_budget: moneyInput(
          loadedBudget.tax_budget,
        ),
        other_overhead_budget: moneyInput(
          loadedBudget.other_overhead_budget,
        ),
        net_margin_target: String(
          loadedBudget.net_margin_target ?? 18,
        ),
        notes: loadedBudget.notes ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setIsLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const actuals = useMemo(() => {
    const revenue = invoices.reduce(
      (sum, invoice) =>
        sum + (invoice.total_amount ?? 0),
      0,
    );

    const byType = {
      payroll: 0,
      materials: 0,
      fuel: 0,
      vehicle: 0,
      equipment: 0,
      insurance: 0,
      software: 0,
      marketing: 0,
      tax: 0,
      other_overhead: 0,
    };

    for (const expense of expenses) {
      const category = Array.isArray(
        expense.expense_categories,
      )
        ? expense.expense_categories[0] ?? null
        : expense.expense_categories;

      const type = category?.expense_type ?? "other";
      const amount = expense.total_amount ?? 0;

      switch (type) {
        case "payroll":
          byType.payroll += amount;
          break;
        case "materials":
          byType.materials += amount;
          break;
        case "fuel":
          byType.fuel += amount;
          break;
        case "vehicle":
          byType.vehicle += amount;
          break;
        case "equipment":
          byType.equipment += amount;
          break;
        case "insurance":
          byType.insurance += amount;
          break;
        case "software":
          byType.software += amount;
          break;
        case "marketing":
          byType.marketing += amount;
          break;
        case "tax":
          byType.tax += amount;
          break;
        default:
          byType.other_overhead += amount;
          break;
      }
    }

    const directCosts =
      byType.payroll +
      byType.materials +
      byType.fuel +
      byType.vehicle +
      byType.equipment;

    const overhead =
      byType.insurance +
      byType.software +
      byType.marketing +
      byType.tax +
      byType.other_overhead;

    const totalExpenses = directCosts + overhead;
    const grossProfit = revenue - directCosts;
    const netProfit = grossProfit - overhead;
    const netMargin =
      revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      ...byType,
      directCosts,
      overhead,
      totalExpenses,
      grossProfit,
      netProfit,
      netMargin,
    };
  }, [expenses, invoices]);

  const budgetTotals = useMemo(() => {
    const payroll = parseMoney(form.payroll_budget);
    const materials = parseMoney(
      form.materials_budget,
    );
    const fuel = parseMoney(form.fuel_budget);
    const vehicle = parseMoney(form.vehicle_budget);
    const equipment = parseMoney(
      form.equipment_budget,
    );
    const insurance = parseMoney(
      form.insurance_budget,
    );
    const software = parseMoney(
      form.software_budget,
    );
    const marketing = parseMoney(
      form.marketing_budget,
    );
    const tax = parseMoney(form.tax_budget);
    const otherOverhead = parseMoney(
      form.other_overhead_budget,
    );

    const directCosts =
      payroll +
      materials +
      fuel +
      vehicle +
      equipment;

    const overhead =
      insurance +
      software +
      marketing +
      tax +
      otherOverhead;

    const revenue = parseMoney(form.revenue_target);
    const totalExpenses = directCosts + overhead;
    const grossProfit = revenue - directCosts;
    const netProfit = grossProfit - overhead;
    const netMargin =
      revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      payroll,
      materials,
      fuel,
      vehicle,
      equipment,
      insurance,
      software,
      marketing,
      tax,
      otherOverhead,
      directCosts,
      overhead,
      totalExpenses,
      grossProfit,
      netProfit,
      netMargin,
    };
  }, [form]);

  const comparisonRows = useMemo(
    () => [
      {
        label: "Revenue",
        budget: budgetTotals.revenue,
        actual: actuals.revenue,
        favorableWhenHigher: true,
      },
      {
        label: "Payroll",
        budget: budgetTotals.payroll,
        actual: actuals.payroll,
        favorableWhenHigher: false,
      },
      {
        label: "Materials",
        budget: budgetTotals.materials,
        actual: actuals.materials,
        favorableWhenHigher: false,
      },
      {
        label: "Fuel",
        budget: budgetTotals.fuel,
        actual: actuals.fuel,
        favorableWhenHigher: false,
      },
      {
        label: "Vehicle",
        budget: budgetTotals.vehicle,
        actual: actuals.vehicle,
        favorableWhenHigher: false,
      },
      {
        label: "Equipment",
        budget: budgetTotals.equipment,
        actual: actuals.equipment,
        favorableWhenHigher: false,
      },
      {
        label: "Insurance",
        budget: budgetTotals.insurance,
        actual: actuals.insurance,
        favorableWhenHigher: false,
      },
      {
        label: "Software",
        budget: budgetTotals.software,
        actual: actuals.software,
        favorableWhenHigher: false,
      },
      {
        label: "Marketing",
        budget: budgetTotals.marketing,
        actual: actuals.marketing,
        favorableWhenHigher: false,
      },
      {
        label: "Taxes",
        budget: budgetTotals.tax,
        actual: actuals.tax,
        favorableWhenHigher: false,
      },
      {
        label: "Other Overhead",
        budget: budgetTotals.otherOverhead,
        actual: actuals.other_overhead,
        favorableWhenHigher: false,
      },
      {
        label: "Total Expenses",
        budget: budgetTotals.totalExpenses,
        actual: actuals.totalExpenses,
        favorableWhenHigher: false,
      },
      {
        label: "Gross Profit",
        budget: budgetTotals.grossProfit,
        actual: actuals.grossProfit,
        favorableWhenHigher: true,
      },
      {
        label: "Net Profit",
        budget: budgetTotals.netProfit,
        actual: actuals.netProfit,
        favorableWhenHigher: true,
      },
    ],
    [actuals, budgetTotals],
  );

  async function saveBudget() {
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const monthStart = `${selectedMonth}-01`;

    const payload = {
      budget_month: monthStart,
      revenue_target: budgetTotals.revenue,
      payroll_budget: budgetTotals.payroll,
      materials_budget: budgetTotals.materials,
      fuel_budget: budgetTotals.fuel,
      vehicle_budget: budgetTotals.vehicle,
      equipment_budget: budgetTotals.equipment,
      insurance_budget: budgetTotals.insurance,
      software_budget: budgetTotals.software,
      marketing_budget: budgetTotals.marketing,
      tax_budget: budgetTotals.tax,
      other_overhead_budget:
        budgetTotals.otherOverhead,
      net_margin_target: parseMoney(
        form.net_margin_target,
      ),
      notes: form.notes.trim() || null,
    };

    const response = await supabase
      .from("monthly_budgets")
      .upsert(payload, {
        onConflict: "budget_month",
      });

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage("Monthly budget saved.");
    await loadData();
    setIsSaving(false);
  }

  function exportCsv() {
    const headers = [
      "Metric",
      "Budget",
      "Actual",
      "Variance",
      "Variance Percent",
    ];

    const rows = comparisonRows.map((row) => {
      const variance = row.actual - row.budget;
      const variancePercent =
        row.budget !== 0
          ? (variance / row.budget) * 100
          : 0;

      return [
        row.label,
        row.budget.toFixed(2),
        row.actual.toFixed(2),
        variance.toFixed(2),
        `${variancePercent.toFixed(2)}%`,
      ];
    });

    rows.push([
      "Net Margin",
      `${parseMoney(
        form.net_margin_target,
      ).toFixed(2)}%`,
      `${actuals.netMargin.toFixed(2)}%`,
      `${(
        actuals.netMargin -
        parseMoney(form.net_margin_target)
      ).toFixed(2)}%`,
      "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) =>
            escapeCsvValue(String(value)),
          )
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `budget-vs-actual-${selectedMonth}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Budget vs. Actuals
        </h1>

        <p className="text-gray-600">
          Loading monthly financial plan…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Financial Planning
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Budget vs. Actuals
          </h1>

          <p className="mt-2 text-gray-600">
            Set monthly targets and compare actual revenue,
            expenses, profit, and margin.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/reports"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Reports
          </Link>

          <Link
            href="/reports/profit-loss"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            Profit & Loss
          </Link>

          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={saveBudget}
            disabled={isSaving}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Budget"}
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

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <label className="block max-w-sm">
          <span className="mb-2 block text-sm font-black">
            Budget Month
          </span>

          <input
            type="month"
            value={selectedMonth}
            onChange={(event) =>
              setSelectedMonth(event.target.value)
            }
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </label>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Revenue Variance"
          value={formatSignedCurrency(
            actuals.revenue - budgetTotals.revenue,
          )}
          note={`${formatCurrency(
            actuals.revenue,
          )} actual vs. ${formatCurrency(
            budgetTotals.revenue,
          )} budget`}
          favorable={
            actuals.revenue >= budgetTotals.revenue
          }
        />

        <SummaryCard
          title="Expense Variance"
          value={formatSignedCurrency(
            actuals.totalExpenses -
              budgetTotals.totalExpenses,
          )}
          note={`${formatCurrency(
            actuals.totalExpenses,
          )} actual vs. ${formatCurrency(
            budgetTotals.totalExpenses,
          )} budget`}
          favorable={
            actuals.totalExpenses <=
            budgetTotals.totalExpenses
          }
        />

        <SummaryCard
          title="Net Profit Variance"
          value={formatSignedCurrency(
            actuals.netProfit - budgetTotals.netProfit,
          )}
          note={`${formatCurrency(
            actuals.netProfit,
          )} actual vs. ${formatCurrency(
            budgetTotals.netProfit,
          )} budget`}
          favorable={
            actuals.netProfit >= budgetTotals.netProfit
          }
        />

        <SummaryCard
          title="Net Margin"
          value={`${actuals.netMargin.toFixed(1)}%`}
          note={`${parseMoney(
            form.net_margin_target,
          ).toFixed(1)}% target`}
          favorable={
            actuals.netMargin >=
            parseMoney(form.net_margin_target)
          }
        />
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-black">
            Monthly Budget
          </h2>

          <p className="mt-1 text-sm font-bold text-gray-500">
            {budget
              ? "Edit the saved budget for this month."
              : "No budget exists for this month. Enter targets and save."}
          </p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <BudgetInput
            label="Revenue Target"
            value={form.revenue_target}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                revenue_target: value,
              }))
            }
          />

          <BudgetInput
            label="Payroll Budget"
            value={form.payroll_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                payroll_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Materials Budget"
            value={form.materials_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                materials_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Fuel Budget"
            value={form.fuel_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                fuel_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Vehicle Budget"
            value={form.vehicle_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                vehicle_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Equipment Budget"
            value={form.equipment_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                equipment_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Insurance Budget"
            value={form.insurance_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                insurance_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Software Budget"
            value={form.software_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                software_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Marketing Budget"
            value={form.marketing_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                marketing_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Tax Budget"
            value={form.tax_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                tax_budget: value,
              }))
            }
          />

          <BudgetInput
            label="Other Overhead"
            value={form.other_overhead_budget}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                other_overhead_budget: value,
              }))
            }
          />

          <label>
            <span className="mb-2 block text-sm font-black">
              Net Margin Target
            </span>

            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="-100"
                max="100"
                value={form.net_margin_target}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    net_margin_target:
                      event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-10"
              />

              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-500">
                %
              </span>
            </div>
          </label>
        </div>

        <div className="mt-5">
          <label>
            <span className="mb-2 block text-sm font-black">
              Budget Notes
            </span>

            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b px-5 py-4">
          <h2 className="text-xl font-black">
            Budget Comparison
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Metric",
                  "Budget",
                  "Actual",
                  "Variance",
                  "Variance %",
                  "Status",
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
              {comparisonRows.map((row) => {
                const variance =
                  row.actual - row.budget;
                const variancePercent =
                  row.budget !== 0
                    ? (variance / row.budget) * 100
                    : 0;
                const favorable =
                  row.favorableWhenHigher
                    ? variance >= 0
                    : variance <= 0;

                return (
                  <tr key={row.label}>
                    <td className="px-5 py-4 font-black text-gray-950">
                      {row.label}
                    </td>

                    <td className="px-5 py-4 text-sm font-black text-gray-900">
                      {formatCurrency(row.budget)}
                    </td>

                    <td className="px-5 py-4 text-sm font-black text-gray-900">
                      {formatCurrency(row.actual)}
                    </td>

                    <td
                      className={`px-5 py-4 text-sm font-black ${
                        favorable
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatSignedCurrency(variance)}
                    </td>

                    <td
                      className={`px-5 py-4 text-sm font-black ${
                        favorable
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {row.budget !== 0
                        ? `${variancePercent.toFixed(1)}%`
                        : "—"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                          favorable
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {favorable
                          ? "Favorable"
                          : "Unfavorable"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-black text-blue-950">
          Budget Basis
        </h2>

        <p className="mt-2 text-sm font-bold leading-6 text-blue-900">
          Actual revenue uses non-draft, non-void invoices by
          invoice date. Actual expenses use expense date and
          expense-type classifications. A positive revenue or
          profit variance is favorable. A negative expense
          variance is favorable because actual spending is below
          budget.
        </p>
      </section>
    </main>
  );
}

function BudgetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-black">
        {label}
      </span>

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
    </label>
  );
}

function SummaryCard({
  title,
  value,
  note,
  favorable,
}: {
  title: string;
  value: string;
  note: string;
  favorable: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm ${
        favorable
          ? "border-green-200 bg-green-50"
          : "border-red-200 bg-red-50"
      }`}
    >
      <p className="text-sm font-black text-gray-500">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-black ${
          favorable ? "text-green-800" : "text-red-800"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs font-bold text-gray-500">
        {note}
      </p>
    </section>
  );
}

function getCurrentMonthInput() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function getMonthEndInput(monthValue: string) {
  const [year, month] = monthValue
    .split("-")
    .map(Number);
  const date = new Date(year, month, 0);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function parseMoney(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyInput(value: number | null) {
  return Number(value ?? 0).toFixed(2);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatSignedCurrency(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatCurrency(value)}`;
}

function escapeCsvValue(value: string) {
  const quote = String.fromCharCode(34);

  if (
    value.includes(",") ||
    value.includes(quote) ||
    value.includes("\n")
  ) {
    return (
      quote +
      value.split(quote).join(quote + quote) +
      quote
    );
  }

  return value;
}