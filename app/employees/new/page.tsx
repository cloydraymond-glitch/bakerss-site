"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabase } from "../../../lib/supabase/client";

type EmployeeForm = {
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  employmentStatus: "active" | "inactive" | "terminated";
  payType: "hourly" | "salary";
  hourlyRate: string;
  salaryAmount: string;
  hireDate: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

const initialForm: EmployeeForm = {
  fullName: "",
  email: "",
  phone: "",
  jobTitle: "",
  employmentStatus: "active",
  payType: "hourly",
  hourlyRate: "",
  salaryAmount: "",
  hireDate: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

export default function NewEmployeePage() {
  const router = useRouter();

  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function updateField<K extends keyof EmployeeForm>(
    field: K,
    value: EmployeeForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");

    const fullName = form.fullName.trim();

    if (!fullName) {
      setErrorMessage("Enter the employee's full name.");
      return;
    }

    const hourlyRate =
      form.payType === "hourly" && form.hourlyRate
        ? Number(form.hourlyRate)
        : null;

    const salaryAmount =
      form.payType === "salary" && form.salaryAmount
        ? Number(form.salaryAmount)
        : null;

    if (
      hourlyRate !== null &&
      (!Number.isFinite(hourlyRate) || hourlyRate < 0)
    ) {
      setErrorMessage("Enter a valid hourly rate.");
      return;
    }

    if (
      salaryAmount !== null &&
      (!Number.isFinite(salaryAmount) || salaryAmount < 0)
    ) {
      setErrorMessage("Enter a valid salary amount.");
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("employees")
      .insert({
        profile_id: null,
        full_name: fullName,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        job_title: form.jobTitle.trim() || null,
        employment_status: form.employmentStatus,
        hourly_rate: hourlyRate,
        salary_amount: salaryAmount,
        pay_type: form.payType,
        hire_date: form.hireDate || null,
        emergency_contact_name:
          form.emergencyContactName.trim() || null,
        emergency_contact_phone:
          form.emergencyContactPhone.trim() || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setErrorMessage(
        error?.message || "The employee could not be created.",
      );
      setIsSaving(false);
      return;
    }

    router.push("/employees");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/employees"
          className="text-sm font-black text-bakerssPink transition hover:opacity-70"
        >
          ← Back to Employees
        </Link>

        <h1 className="mt-3 text-3xl font-black">
          Add Employee
        </h1>

        <p className="mt-2 text-gray-600">
          Create the employee record first. A Supabase login can
          be linked later through the employee&apos;s profile ID.
        </p>
      </div>

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
            Employee Information
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label
                htmlFor="fullName"
                className="mb-2 block text-sm font-black"
              >
                Full Name
              </label>

              <input
                id="fullName"
                type="text"
                value={form.fullName}
                onChange={(event) =>
                  updateField("fullName", event.target.value)
                }
                required
                placeholder="Employee's full name"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-black"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  updateField("email", event.target.value)
                }
                placeholder="employee@example.com"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-black"
              >
                Phone
              </label>

              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  updateField("phone", event.target.value)
                }
                placeholder="(843) 555-0000"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label
                htmlFor="jobTitle"
                className="mb-2 block text-sm font-black"
              >
                Job Title
              </label>

              <input
                id="jobTitle"
                type="text"
                value={form.jobTitle}
                onChange={(event) =>
                  updateField("jobTitle", event.target.value)
                }
                placeholder="Technician, Manager, Cleaner"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label
                htmlFor="employmentStatus"
                className="mb-2 block text-sm font-black"
              >
                Employment Status
              </label>

              <select
                id="employmentStatus"
                value={form.employmentStatus}
                onChange={(event) =>
                  updateField(
                    "employmentStatus",
                    event.target.value as EmployeeForm["employmentStatus"],
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="hireDate"
                className="mb-2 block text-sm font-black"
              >
                Hire Date
              </label>

              <input
                id="hireDate"
                type="date"
                value={form.hireDate}
                onChange={(event) =>
                  updateField("hireDate", event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Compensation
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="payType"
                className="mb-2 block text-sm font-black"
              >
                Pay Type
              </label>

              <select
                id="payType"
                value={form.payType}
                onChange={(event) =>
                  updateField(
                    "payType",
                    event.target.value as EmployeeForm["payType"],
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
              </select>
            </div>

            {form.payType === "hourly" ? (
              <div>
                <label
                  htmlFor="hourlyRate"
                  className="mb-2 block text-sm font-black"
                >
                  Hourly Rate
                </label>

                <input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.hourlyRate}
                  onChange={(event) =>
                    updateField("hourlyRate", event.target.value)
                  }
                  placeholder="18.00"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="salaryAmount"
                  className="mb-2 block text-sm font-black"
                >
                  Annual Salary
                </label>

                <input
                  id="salaryAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salaryAmount}
                  onChange={(event) =>
                    updateField("salaryAmount", event.target.value)
                  }
                  placeholder="53000.00"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Emergency Contact
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="emergencyContactName"
                className="mb-2 block text-sm font-black"
              >
                Contact Name
              </label>

              <input
                id="emergencyContactName"
                type="text"
                value={form.emergencyContactName}
                onChange={(event) =>
                  updateField(
                    "emergencyContactName",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label
                htmlFor="emergencyContactPhone"
                className="mb-2 block text-sm font-black"
              >
                Contact Phone
              </label>

              <input
                id="emergencyContactPhone"
                type="tel"
                value={form.emergencyContactPhone}
                onChange={(event) =>
                  updateField(
                    "emergencyContactPhone",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/employees"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Creating Employee..." : "Create Employee"}
          </button>
        </div>
      </form>
    </div>
  );
}