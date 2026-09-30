"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase/client";

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

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
};

type LoginProfile = {
  id: string;
  email: string | null;
  role: string | null;
};

type TimeEntry = {
  id: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  status: string | null;
};

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loginProfile, setLoginProfile] = useState<LoginProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState("technician");
  const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadEmployee() {
      setIsLoading(true);
      setErrorMessage("");

      const [employeeResponse, jobsResponse, timeResponse] = await Promise.all([
        supabase
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
          .eq("id", employeeId)
          .single(),

        supabase
          .from("jobs")
          .select(`
            id,
            job_title,
            job_status,
            scheduled_start,
            estimated_price
          `)
          .eq("assigned_employee_id", employeeId)
          .order("scheduled_start", { ascending: false, nullsFirst: false })
          .limit(10),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            clock_in_time,
            clock_out_time,
            status
          `)
          .eq("employee_id", employeeId)
          .order("clock_in_time", { ascending: false, nullsFirst: false })
          .limit(10),
      ]);

      const firstError =
        employeeResponse.error || jobsResponse.error || timeResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedEmployee = employeeResponse.data as Employee;
      setEmployee(loadedEmployee);

      if (loadedEmployee.profile_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, email, role")
          .eq("id", loadedEmployee.profile_id)
          .maybeSingle();
        if (profileData) {
          const typedProfile = profileData as LoginProfile;
          setLoginProfile(typedProfile);
          if (["admin", "manager", "technician", "employee"].includes(typedProfile.role || "")) {
            setSelectedRole(typedProfile.role as string);
          }
        }
      } else {
        setLoginProfile(null);
      }

      setJobs((jobsResponse.data ?? []) as Job[]);
      setTimeEntries((timeResponse.data ?? []) as TimeEntry[]);
      setIsLoading(false);
    }

    if (employeeId) {
      void loadEmployee();
    }
  }, [employeeId]);

  async function callAccessApi(method: "POST" | "PATCH", payload: Record<string, string>) {
    setIsUpdatingAccess(true);
    setErrorMessage("");
    setAccessMessage("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setErrorMessage("Your administrator session has expired. Sign in again.");
      setIsUpdatingAccess(false);
      return;
    }

    const response = await fetch("/api/admin/employee-access", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ employeeId, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) {
      setErrorMessage(result.error || "Employee access could not be updated.");
      setIsUpdatingAccess(false);
      return;
    }

    setAccessMessage(method === "POST" ? "Login invitation sent and employee linked." : "Employee access updated.");
    window.location.reload();
  }

  async function sendPasswordReset() {
    if (!employee?.email) return;
    setIsUpdatingAccess(true);
    setErrorMessage("");
    setAccessMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(employee.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsUpdatingAccess(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setAccessMessage("Password setup/reset email sent.");
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">Loading employee...</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage || "Employee not found."}
        </div>
        <Link href="/employees" className="font-black text-bakerssPink">
          ← Back to Employees
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href="/employees"
            className="text-sm font-black text-bakerssPink transition hover:opacity-70"
          >
            ← Back to Employees
          </Link>

          <h1 className="mt-3 text-3xl font-black">{employee.full_name}</h1>

          <div className="mt-3 flex flex-wrap gap-2">
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
              {employee.profile_id ? "Login linked" : "No login linked"}
            </span>
          </div>
        </div>

        <Link
          href={`/employees/${employee.id}/edit`}
          className="rounded-xl bg-bakerssPink px-5 py-3 text-center text-sm font-black text-white transition hover:opacity-90"
        >
          Edit Employee
        </Link>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Employee Information</h2>
            <dl className="mt-5 grid gap-5 md:grid-cols-2">
              <InfoItem label="Job Title" value={employee.job_title || "Not set"} />
              <InfoItem label="Email" value={employee.email || "Not set"} />
              <InfoItem label="Phone" value={employee.phone || "Not set"} />
              <InfoItem label="Hire Date" value={formatDate(employee.hire_date)} />
              <InfoItem label="Compensation" value={formatCompensation(employee)} />
              <InfoItem
                label="Employment Status"
                value={formatStatus(employee.employment_status)}
              />
            </dl>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Recent Assigned Jobs</h2>
            {jobs.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No assigned jobs found.</p>
            ) : (
              <div className="mt-4 divide-y rounded-xl border">
                {jobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/work-orders/${job.id}`}
                    className="block p-4 transition hover:bg-gray-50"
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <p className="font-black text-gray-950">{job.job_title}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDateTime(job.scheduled_start)}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black">
                          {formatStatus(job.job_status)}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {job.estimated_price === null
                            ? "No price"
                            : formatCurrency(job.estimated_price)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Recent Time Entries</h2>
            {timeEntries.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No time entries found.</p>
            ) : (
              <div className="mt-4 divide-y rounded-xl border">
                {timeEntries.map((entry) => (
                  <div key={entry.id} className="p-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div>
                        <p className="font-black">
                          {formatDateTime(entry.clock_in_time)}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Clock out: {formatDateTime(entry.clock_out_time)}
                        </p>
                      </div>
                      <p className="text-sm font-black">
                        {formatStatus(entry.status)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">Login Connection</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              {employee.profile_id
                ? "This employee record is connected to a Bakerss OS login."
                : "Create a login only when this employee needs access to Bakerss OS."}
            </p>

            {accessMessage && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
                {accessMessage}
              </div>
            )}

            <div className="mt-4 space-y-4 rounded-xl bg-gray-50 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">Login Status</p>
                <p className="mt-1 text-sm font-black">
                  {!employee.profile_id ? "Not linked" : loginProfile?.role === "disabled" ? "Disabled" : "Active"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">Login Email</p>
                <p className="mt-1 break-all text-sm font-bold">{loginProfile?.email || employee.email || "Not set"}</p>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-gray-500">App Role</label>
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value)}
                  disabled={isUpdatingAccess}
                  className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm font-bold"
                >
                  <option value="admin">Administrator</option>
                  <option value="manager">Manager</option>
                  <option value="technician">Technician</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
              {employee.profile_id && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">Profile ID</p>
                  <p className="mt-1 break-all text-xs font-bold">{employee.profile_id}</p>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {!employee.profile_id ? (
                <button
                  type="button"
                  disabled={isUpdatingAccess || !employee.email}
                  onClick={() => callAccessApi("POST", { role: selectedRole })}
                  className="w-full rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {isUpdatingAccess ? "Creating Login..." : "Create Employee Login"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isUpdatingAccess}
                    onClick={() => callAccessApi("PATCH", { action: loginProfile?.role === "disabled" ? "enable" : "role", role: selectedRole })}
                    className="w-full rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {loginProfile?.role === "disabled" ? "Enable Login" : "Save App Role"}
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingAccess || !employee.email}
                    onClick={sendPasswordReset}
                    className="w-full rounded-xl border px-4 py-3 text-sm font-black disabled:opacity-50"
                  >
                    Send Password Setup / Reset
                  </button>
                  {loginProfile?.role !== "disabled" && (
                    <button
                      type="button"
                      disabled={isUpdatingAccess}
                      onClick={() => callAccessApi("PATCH", { action: "disable" })}
                      className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-50"
                    >
                      Disable Login
                    </button>
                  )}
                </>
              )}
              {!employee.email && (
                <p className="text-xs font-bold text-amber-700">Add an employee email address before creating a login.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">Emergency Contact</h2>
            <div className="mt-4 space-y-4">
              <InfoItem
                label="Name"
                value={employee.emergency_contact_name || "Not set"}
              />
              <InfoItem
                label="Phone"
                value={employee.emergency_contact_phone || "Not set"}
              />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-gray-950">{value}</dd>
    </div>
  );
}

function formatStatus(value: string | null) {
  if (!value) return "Unknown";
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
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCompensation(employee: Employee) {
  if (employee.pay_type === "salary") {
    if (employee.salary_amount === null) return "Salary not set";
    return `${formatCurrency(employee.salary_amount)} / year`;
  }
  if (employee.hourly_rate === null) return "Hourly rate not set";
  return `${formatCurrency(employee.hourly_rate)} / hour`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}