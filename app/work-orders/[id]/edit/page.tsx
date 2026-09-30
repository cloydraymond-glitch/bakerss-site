"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase/client";

type Client = {
  id: string;
  client_name: string;
};

type Property = {
  id: string;
  client_id: string | null;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
};

type Service = {
  id: string;
  service_name: string;
};

type Employee = {
  id: string;
  full_name: string;
};

type JobRecord = {
  id: string;
  job_title: string;
  client_id: string | null;
  property_id: string | null;
  service_id: string | null;
  assigned_employee_id: string | null;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  description: string | null;
};

type FormState = {
  jobTitle: string;
  clientId: string;
  propertyId: string;
  serviceId: string;
  employeeId: string;
  jobStatus: string;
  priority: string;
  scheduledStart: string;
  estimatedPrice: string;
  description: string;
};

type ActivityChange = {
  field: string;
  label: string;
  old_value: string | number | null;
  new_value: string | number | null;
};

const emptyForm: FormState = {
  jobTitle: "",
  clientId: "",
  propertyId: "",
  serviceId: "",
  employeeId: "",
  jobStatus: "new",
  priority: "normal",
  scheduledStart: "",
  estimatedPrice: "",
  description: "",
};

export default function EditWorkOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const workOrderId = params.id;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [originalJob, setOriginalJob] = useState<JobRecord | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadPage() {
      if (!workOrderId) {
        setErrorMessage("Missing work-order ID.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      const [
        jobResponse,
        clientsResponse,
        propertiesResponse,
        servicesResponse,
        employeesResponse,
      ] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            job_title,
            client_id,
            property_id,
            service_id,
            assigned_employee_id,
            job_status,
            priority,
            scheduled_start,
            estimated_price,
            description
          `)
          .eq("id", workOrderId)
          .single(),

        supabase
          .from("clients")
          .select("id, client_name")
          .order("client_name", { ascending: true }),

        supabase
          .from("properties")
          .select(`
            id,
            client_id,
            property_name,
            street_address,
            city,
            state
          `)
          .order("property_name", { ascending: true }),

        supabase
          .from("services")
          .select("id, service_name")
          .order("service_name", { ascending: true }),

        supabase
          .from("employees")
          .select("id, full_name")
          .order("full_name", { ascending: true }),
      ]);

      const firstError =
        jobResponse.error ||
        clientsResponse.error ||
        propertiesResponse.error ||
        servicesResponse.error ||
        employeesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const job = jobResponse.data as JobRecord;

      setOriginalJob(job);

      setClients((clientsResponse.data ?? []) as Client[]);
      setProperties((propertiesResponse.data ?? []) as Property[]);
      setServices((servicesResponse.data ?? []) as Service[]);
      setEmployees((employeesResponse.data ?? []) as Employee[]);

      setForm({
        jobTitle: job.job_title || "",
        clientId: job.client_id || "",
        propertyId: job.property_id || "",
        serviceId: job.service_id || "",
        employeeId: job.assigned_employee_id || "",
        jobStatus: job.job_status || "new",
        priority: job.priority || "normal",
        scheduledStart: formatDateForInput(job.scheduled_start),
        estimatedPrice:
          job.estimated_price === null ||
          job.estimated_price === undefined
            ? ""
            : String(job.estimated_price),
        description: job.description || "",
      });

      setIsLoading(false);
    }

    void loadPage();
  }, [workOrderId]);

  const filteredProperties = useMemo(() => {
    if (!form.clientId) {
      return properties;
    }

    return properties.filter(
      (property) => property.client_id === form.clientId,
    );
  }, [form.clientId, properties]);

  function formatDateForInput(value: string | null) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);

    return localDate.toISOString().slice(0, 16);
  }

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleClientChange(clientId: string) {
    setForm((current) => {
      const currentProperty = properties.find(
        (property) => property.id === current.propertyId,
      );

      const propertyBelongsToClient =
        currentProperty?.client_id === clientId;

      return {
        ...current,
        clientId,
        propertyId: propertyBelongsToClient
          ? current.propertyId
          : "",
      };
    });
  }

  function formatPropertyLabel(property: Property) {
    const primaryLabel =
      property.property_name ||
      property.street_address ||
      "Unnamed property";

    const location = [
      property.street_address,
      property.city,
      property.state,
    ]
      .filter(Boolean)
      .join(", ");

    if (!location || location === primaryLabel) {
      return primaryLabel;
    }

    return `${primaryLabel} — ${location}`;
  }

  function getClientName(id: string | null) {
    if (!id) {
      return "None";
    }

    return clients.find((client) => client.id === id)?.client_name || id;
  }

  function getPropertyName(id: string | null) {
    if (!id) {
      return "None";
    }

    const property = properties.find((item) => item.id === id);

    return property ? formatPropertyLabel(property) : id;
  }

  function getServiceName(id: string | null) {
    if (!id) {
      return "None";
    }

    return services.find((service) => service.id === id)?.service_name || id;
  }

  function getEmployeeName(id: string | null) {
    if (!id) {
      return "Unassigned";
    }

    return employees.find((employee) => employee.id === id)?.full_name || id;
  }

  function normalizeText(value: string | null) {
    return value?.trim() || null;
  }

  function normalizeDate(value: string | null) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  function buildChanges(
    previous: JobRecord,
    next: {
      job_title: string;
      client_id: string;
      property_id: string | null;
      service_id: string | null;
      assigned_employee_id: string | null;
      job_status: string;
      priority: string;
      scheduled_start: string | null;
      estimated_price: number | null;
      description: string | null;
    },
  ) {
    const changes: ActivityChange[] = [];

    function addChange(
      field: string,
      label: string,
      oldValue: string | number | null,
      newValue: string | number | null,
    ) {
      if (oldValue !== newValue) {
        changes.push({
          field,
          label,
          old_value: oldValue,
          new_value: newValue,
        });
      }
    }

    addChange(
      "job_title",
      "Work Order Title",
      normalizeText(previous.job_title),
      normalizeText(next.job_title),
    );

    if ((previous.client_id || null) !== (next.client_id || null)) {
      addChange(
        "client_id",
        "Customer",
        getClientName(previous.client_id),
        getClientName(next.client_id),
      );
    }

    if ((previous.property_id || null) !== (next.property_id || null)) {
      addChange(
        "property_id",
        "Property",
        getPropertyName(previous.property_id),
        getPropertyName(next.property_id),
      );
    }

    if ((previous.service_id || null) !== (next.service_id || null)) {
      addChange(
        "service_id",
        "Service",
        getServiceName(previous.service_id),
        getServiceName(next.service_id),
      );
    }

    if (
      (previous.assigned_employee_id || null) !==
      (next.assigned_employee_id || null)
    ) {
      addChange(
        "assigned_employee_id",
        "Assigned Employee",
        getEmployeeName(previous.assigned_employee_id),
        getEmployeeName(next.assigned_employee_id),
      );
    }

    addChange(
      "job_status",
      "Status",
      previous.job_status || "new",
      next.job_status || "new",
    );

    addChange(
      "priority",
      "Priority",
      previous.priority || "normal",
      next.priority || "normal",
    );

    addChange(
      "scheduled_start",
      "Scheduled Start",
      normalizeDate(previous.scheduled_start),
      normalizeDate(next.scheduled_start),
    );

    addChange(
      "estimated_price",
      "Estimated Price",
      previous.estimated_price,
      next.estimated_price,
    );

    addChange(
      "description",
      "Job Description",
      normalizeText(previous.description),
      normalizeText(next.description),
    );

    return changes;
  }

  async function syncOpenDispatchAssignment(
    jobId: string,
    employeeId: string | null,
  ) {
    const { data: openAssignments, error: lookupError } = await supabase
      .from("dispatch_assignments")
      .select("id, employee_id")
      .eq("job_id", jobId)
      .is("closed_at", null);

    if (lookupError) {
      return lookupError;
    }

    const currentAssignments = openAssignments ?? [];
    const matchingAssignment = employeeId
      ? currentAssignments.find(
          (assignment) => assignment.employee_id === employeeId,
        )
      : null;

    const assignmentsToClose = currentAssignments.filter(
      (assignment) =>
        !matchingAssignment || assignment.id !== matchingAssignment.id,
    );

    if (assignmentsToClose.length > 0) {
      const now = new Date().toISOString();

      const { error: closeError } = await supabase
        .from("dispatch_assignments")
        .update({
          assignment_status: "closed",
          closed_at: now,
        })
        .in(
          "id",
          assignmentsToClose.map((assignment) => assignment.id),
        );

      if (closeError) {
        return closeError;
      }
    }

    if (employeeId && !matchingAssignment) {
      const { error: insertError } = await supabase
        .from("dispatch_assignments")
        .insert({
          job_id: jobId,
          employee_id: employeeId,
          assignment_status: "assigned",
          assigned_at: new Date().toISOString(),
        });

      if (insertError) {
        return insertError;
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.jobTitle.trim()) {
      setErrorMessage("Enter a work-order title.");
      return;
    }

    if (!form.clientId) {
      setErrorMessage("Select a customer.");
      return;
    }

    const estimatedPrice =
      form.estimatedPrice.trim() === ""
        ? null
        : Number(form.estimatedPrice);

    if (
      estimatedPrice !== null &&
      (!Number.isFinite(estimatedPrice) || estimatedPrice < 0)
    ) {
      setErrorMessage("Enter a valid estimated price.");
      return;
    }

    setIsSaving(true);

    const updateData = {
      job_title: form.jobTitle.trim(),
      client_id: form.clientId,
      property_id: form.propertyId || null,
      service_id: form.serviceId || null,
      assigned_employee_id: form.employeeId || null,
      job_status: form.jobStatus,
      priority: form.priority,
      scheduled_start: form.scheduledStart
        ? new Date(form.scheduledStart).toISOString()
        : null,
      estimated_price: estimatedPrice,
      description: form.description.trim() || null,
    };

    const { error } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", workOrderId);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    const dispatchEmployeeId =
      ["completed", "cancelled"].includes(updateData.job_status)
        ? null
        : updateData.assigned_employee_id;

    const dispatchError = await syncOpenDispatchAssignment(
      workOrderId,
      dispatchEmployeeId,
    );

    if (dispatchError) {
      if (originalJob) {
        await supabase
          .from("jobs")
          .update({
            assigned_employee_id: originalJob.assigned_employee_id,
          })
          .eq("id", workOrderId);
      }

      setErrorMessage(
        `Work order changes were saved, but the dispatch assignment could not be synchronized: ${dispatchError.message}`,
      );
      setIsSaving(false);
      return;
    }

    const changes = originalJob ? buildChanges(originalJob, updateData) : [];

    if (changes.length > 0) {
      const changeSummary = changes
        .map((change) => change.label)
        .join(", ");

      const { error: activityError } = await supabase
        .from("activity_log")
        .insert({
          actor_profile_id: null,
          action: "work_order_updated",
          activity_type: "work_order_updated",
          entity_type: "job",
          entity_id: workOrderId,
          metadata: {
            note: `Updated: ${changeSummary}`,
            changes,
          },
        });

      if (activityError) {
        setErrorMessage(
          `The work order was updated, but the activity history could not be recorded: ${activityError.message}`,
        );
        setSuccessMessage("Work order changes were saved.");
        setOriginalJob({
          ...originalJob!,
          ...updateData,
          id: workOrderId,
        });
        setIsSaving(false);
        return;
      }
    }

    setSuccessMessage(
      changes.length > 0
        ? "Work order updated and activity recorded."
        : "No changes were detected.",
    );

    router.push(`/work-orders/${workOrderId}`);
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-bold">Loading work order...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href={`/work-orders/${workOrderId}`}
            className="text-sm font-black text-bakerssPink transition hover:opacity-70"
          >
            ← Back to Work Order
          </Link>

          <h1 className="mt-3 text-3xl font-black">
            Edit Work Order
          </h1>

          <p className="mt-1 text-gray-600">
            Update the job, schedule, assignment, status, and price.
          </p>
        </div>

        <Link
          href="/work-orders"
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
        >
          All Work Orders
        </Link>
      </div>

      {errorMessage && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {successMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-2xl border bg-white p-6 shadow-sm md:p-8"
      >
        <div>
          <label
            htmlFor="jobTitle"
            className="mb-2 block text-sm font-black text-gray-800"
          >
            Work Order Title
          </label>

          <input
            id="jobTitle"
            type="text"
            value={form.jobTitle}
            onChange={(event) =>
              updateField("jobTitle", event.target.value)
            }
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            required
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="clientId"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Customer
            </label>

            <select
              id="clientId"
              value={form.clientId}
              onChange={(event) =>
                handleClientChange(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              required
            >
              <option value="">Select a customer</option>

              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.client_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="propertyId"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Property
            </label>

            <select
              id="propertyId"
              value={form.propertyId}
              onChange={(event) =>
                updateField("propertyId", event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            >
              <option value="">Select a property</option>

              {filteredProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {formatPropertyLabel(property)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="serviceId"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Service
            </label>

            <select
              id="serviceId"
              value={form.serviceId}
              onChange={(event) =>
                updateField("serviceId", event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            >
              <option value="">Select a service</option>

              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.service_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="employeeId"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Assigned Employee
            </label>

            <select
              id="employeeId"
              value={form.employeeId}
              onChange={(event) =>
                updateField("employeeId", event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            >
              <option value="">Leave unassigned</option>

              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="jobStatus"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Status
            </label>

            <select
              id="jobStatus"
              value={form.jobStatus}
              onChange={(event) =>
                updateField("jobStatus", event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            >
              <option value="new">New</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_on_materials">
                Waiting on Materials
              </option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="priority"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Priority
            </label>

            <select
              id="priority"
              value={form.priority}
              onChange={(event) =>
                updateField("priority", event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="scheduledStart"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Scheduled Start
            </label>

            <input
              id="scheduledStart"
              type="datetime-local"
              value={form.scheduledStart}
              onChange={(event) =>
                updateField("scheduledStart", event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />
          </div>

          <div>
            <label
              htmlFor="estimatedPrice"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Estimated Price
            </label>

            <input
              id="estimatedPrice"
              type="number"
              min="0"
              step="0.01"
              value={form.estimatedPrice}
              onChange={(event) =>
                updateField("estimatedPrice", event.target.value)
              }
              placeholder="0.00"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-black text-gray-800"
          >
            Job Description and Instructions
          </label>

          <textarea
            id="description"
            value={form.description}
            onChange={(event) =>
              updateField("description", event.target.value)
            }
            rows={7}
            className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
          <Link
            href={`/work-orders/${workOrderId}`}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-bakerssPink px-6 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
