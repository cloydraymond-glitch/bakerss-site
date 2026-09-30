"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase/client";

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

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id;
  const router = useRouter();

  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadEmployee() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("employees")
        .select(`
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
        .eq("id", employeeId)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || "Employee not found.");
        setIsLoading(false);
        return;
      }

      setProfileId(data.profile_id);
      setForm({
        fullName: data.full_name || "",
        email: data.email || "",
        phone: data.phone || "",
        jobTitle: data.job_title || "",
        employmentStatus:
          data.employment_status === "inactive" ||
          data.employment_status === "terminated"
            ? data.employment_status
            : "active",
        payType: data.pay_type === "salary" ? "salary" : "hourly",
        hourlyRate:
          data.hourly_rate === null ? "" : String(data.hourly_rate),
        salaryAmount:
          data.salary_amount === null ? "" : String(data.salary_amount),
        hireDate: data.hire_date || "",
        emergencyContactName: data.emergency_contact_name || "",
        emergencyContactPhone: data.emergency_contact_phone || "",
      });

      setIsLoading(false);
    }

    if (employeeId) {
      void loadEmployee();
    }
  }, [employeeId]);

  function updateField<K extends keyof EmployeeForm>(
    field: K,
    value: EmployeeForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    const { error } = await supabase
      .from("employees")
      .update({
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
      .eq("id", employeeId);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push(`/employees/${employeeId}`);
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">Loading employee...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/employees/${employeeId}`}
          className="text-sm font-black text-bakerssPink transition hover:opacity-70"
        >
          ← Back to Employee
        </Link>

        <h1 className="mt-3 text-3xl font-black">Edit Employee</h1>
        <p className="mt-2 text-gray-600">
          Update personnel, compensation, status, and emergency-contact information.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section
        className={`rounded-2xl border p-5 shadow-sm ${
          profileId
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <p className="text-sm font-black">
          {profileId
            ? "Login account is connected"
            : "No login account is connected"}
        </p>
        <p className="mt-1 break-all text-sm text-gray-600">
          Profile ID: {profileId || "Not linked"}
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Employee Information</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="fullName" className="mb-2 block text-sm font-black">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-black">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
              {profileId && (
                <p className="mt-2 text-xs leading-5 text-amber-700">
                  Changing this field does not change the Supabase Authentication login email. Update the Auth user separately when the login email changes.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-black">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label htmlFor="jobTitle" className="mb-2 block text-sm font-black">
                Job Title
              </label>
              <input
                id="jobTitle"
                type="text"
                value={form.jobTitle}
                onChange={(event) => updateField("jobTitle", event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label htmlFor="employmentStatus" className="mb-2 block text-sm font-black">
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
              <label htmlFor="hireDate" className="mb-2 block text-sm font-black">
                Hire Date
              </label>
              <input
                id="hireDate"
                type="date"
                value={form.hireDate}
                onChange={(event) => updateField("hireDate", event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Compensation</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="payType" className="mb-2 block text-sm font-black">
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
                <label htmlFor="hourlyRate" className="mb-2 block text-sm font-black">
                  Hourly Rate
                </label>
                <input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.hourlyRate}
                  onChange={(event) => updateField("hourlyRate", event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="salaryAmount" className="mb-2 block text-sm font-black">
                  Annual Salary
                </label>
                <input
                  id="salaryAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salaryAmount}
                  onChange={(event) => updateField("salaryAmount", event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Emergency Contact</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="emergencyContactName" className="mb-2 block text-sm font-black">
                Contact Name
              </label>
              <input
                id="emergencyContactName"
                type="text"
                value={form.emergencyContactName}
                onChange={(event) =>
                  updateField("emergencyContactName", event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label htmlFor="emergencyContactPhone" className="mb-2 block text-sm font-black">
                Contact Phone
              </label>
              <input
                id="emergencyContactPhone"
                type="tel"
                value={form.emergencyContactPhone}
                onChange={(event) =>
                  updateField("emergencyContactPhone", event.target.value)
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href={`/employees/${employeeId}`}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}