"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Employee = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  employment_status: string | null;
  hourly_rate: number | null;
  salary_amount: number | null;
  pay_type: string | null;
  hire_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

type StatusFilter = "all" | "active" | "inactive" | "terminated";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadEmployees = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      let query = supabase
        .from("employees")
        .select(`
          id,
          profile_id,
          full_name,
          email,
          phone,
          job_title,
          employment_status,
          hourly_rate,
          salary_amount,
          pay_type,
          hire_date,
          emergency_contact_name,
          emergency_contact_phone
        `)
        .order("full_name", { ascending: true });

      if (statusFilter !== "all") {
        query = query.eq("employment_status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        setErrorMessage(error.message);
        setEmployees([]);
      } else {
        setEmployees((data ?? []) as Employee[]);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [statusFilter],
  );

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const filteredEmployees = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return employees;
    }

    return employees.filter((employee) =>
      [
        employee.full_name,
        employee.email,
        employee.phone,
        employee.job_title,
      ].some((value) => value?.toLowerCase().includes(search)),
    );
  }, [employees, searchTerm]);

  const activeCount = employees.filter(
    (employee) => employee.employment_status === "active",
  ).length;

  const linkedCount = employees.filter(
    (employee) => Boolean(employee.profile_id),
  ).length;

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">Loading employees...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Team
          </p>

          <h1 className="mt-1 text-3xl font-black">Employees</h1>

          <p className="mt-2 text-gray-600">
            Manage employee records, compensation, status, and login linkage.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadEmployees(true)}
            disabled={isRefreshing}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>

          <Link
            href="/employees/new"
            className="rounded-xl bg-bakerssPink px-5 py-3 text-center text-sm font-black text-white transition hover:opacity-90"
          >
            Add Employee
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard title="Total Employees" value={String(employees.length)} />
        <SummaryCard title="Active Employees" value={String(activeCount)} />
        <SummaryCard title="Login Linked" value={String(linkedCount)} />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="mb-2 block text-sm font-black">
              Search Employees
            </label>

            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, email, phone, or job title"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black">
              Employment Status
            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            >
              <option value="all">All employees</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-xl font-black">Employee Records</h2>
          <p className="mt-1 text-sm text-gray-500">
            {filteredEmployees.length} employee
            {filteredEmployees.length === 1 ? "" : "s"} found
          </p>
        </div>

        {filteredEmployees.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="text-lg font-black">No employee records found</h3>
            <p className="mt-2 text-sm text-gray-500">
              Add your first employee or adjust the current filter.
            </p>

            <Link
              href="/employees/new"
              className="mt-5 inline-flex rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white"
            >
              Add Employee
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {filteredEmployees.map((employee) => (
              <article
                key={employee.id}
                className="p-5 transition hover:bg-gray-50"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/employees/${employee.id}`}
                        className="text-lg font-black text-gray-950 transition hover:text-bakerssPink"
                      >
                        {employee.full_name}
                      </Link>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getStatusClasses(
                          employee.employment_status,
                        )}`}
                      >
                        {formatStatus(employee.employment_status)}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          employee.profile_id
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {employee.profile_id
                          ? "Login linked"
                          : "No login linked"}
                      </span>
                    </div>

                    <p className="mt-2 font-bold text-gray-700">
                      {employee.job_title || "No job title"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                      <span>{employee.email || "No email"}</span>
                      <span>{employee.phone || "No phone"}</span>
                      <span>
                        Hired {formatDate(employee.hire_date)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                        Compensation
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {formatCompensation(employee)}
                      </p>
                    </div>

                    <Link
                      href={`/employees/${employee.id}`}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-center text-sm font-black transition hover:bg-gray-50"
                    >
                      View
                    </Link>

                    <Link
                      href={`/employees/${employee.id}/edit`}
                      className="rounded-xl bg-gray-950 px-4 py-2 text-center text-sm font-black text-white transition hover:opacity-90"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-black text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-gray-950">{value}</p>
    </section>
  );
}

function formatStatus(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusClasses(status: string | null) {
  switch (status) {
    case "active":
      return "bg-green-50 text-green-700";
    case "inactive":
      return "bg-amber-50 text-amber-700";
    case "terminated":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "not set";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCompensation(employee: Employee) {
  if (employee.pay_type === "salary") {
    if (employee.salary_amount === null) {
      return "Salary not set";
    }

    return `${formatCurrency(employee.salary_amount)} / year`;
  }

  if (employee.hourly_rate === null) {
    return "Hourly rate not set";
  }

  return `${formatCurrency(employee.hourly_rate)} / hour`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}