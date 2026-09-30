"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../../../lib/supabase/client";

type GenericEstimate = Record<string, unknown> & {
  id: string;
  client_id?: string | null;
  property_id?: string | null;
  service_id?: string | null;
  estimate_status?: string | null;
  converted_job_id?: string | null;
  estimate_title?: string | null;
  scope_of_work?: string | null;
  estimated_total?: number | string | null;
};

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

type FormState = {
  clientId: string;
  propertyId: string;
  serviceId: string;
  employeeId: string;
  jobTitle: string;
  description: string;
  scheduledStart: string;
  priority: string;
  estimatedPrice: string;
};

const emptyForm: FormState = {
  clientId: "",
  propertyId: "",
  serviceId: "",
  employeeId: "",
  jobTitle: "",
  description: "",
  scheduledStart: "",
  priority: "normal",
  estimatedPrice: "",
};

export default function ConvertEstimatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const estimateId = params.id;

  const [estimate, setEstimate] =
    useState<GenericEstimate | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] =
    useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] =
    useState<Employee[]>([]);
  const [form, setForm] =
    useState<FormState>(emptyForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPage = useCallback(async () => {
    if (!estimateId) {
      setErrorMessage("Estimate ID is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const [
      estimateResponse,
      clientsResponse,
      propertiesResponse,
      servicesResponse,
      employeesResponse,
    ] = await Promise.all([
      supabase
        .from("estimate_requests")
        .select("*")
        .eq("id", estimateId)
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
        .eq("employment_status", "active")
        .order("full_name", { ascending: true }),
    ]);

    const firstError =
      estimateResponse.error ||
      clientsResponse.error ||
      propertiesResponse.error ||
      servicesResponse.error ||
      employeesResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedEstimate =
      estimateResponse.data as GenericEstimate;

    const loadedClients =
      (clientsResponse.data ?? []) as Client[];
    const loadedProperties =
      (propertiesResponse.data ?? []) as Property[];
    const loadedServices =
      (servicesResponse.data ?? []) as Service[];

    setEstimate(loadedEstimate);
    setClients(loadedClients);
    setProperties(loadedProperties);
    setServices(loadedServices);
    setEmployees(
      (employeesResponse.data ?? []) as Employee[],
    );

    const inferredClientId =
      stringValue(loadedEstimate.client_id) ||
      inferClientId(loadedEstimate, loadedClients);

    const inferredPropertyId =
      stringValue(loadedEstimate.property_id) ||
      inferPropertyId(
        loadedEstimate,
        loadedProperties,
        inferredClientId,
      );

    const inferredServiceId =
      stringValue(loadedEstimate.service_id) ||
      inferServiceId(loadedEstimate, loadedServices);

    setForm({
      clientId: inferredClientId,
      propertyId: inferredPropertyId,
      serviceId: inferredServiceId,
      employeeId: "",
      jobTitle: inferTitle(loadedEstimate),
      description: inferDescription(loadedEstimate),
      scheduledStart: "",
      priority: "normal",
      estimatedPrice: inferPrice(loadedEstimate),
    });

    setIsLoading(false);
  }, [estimateId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const filteredProperties = useMemo(() => {
    if (!form.clientId) {
      return properties;
    }

    return properties.filter(
      (property) =>
        !property.client_id ||
        property.client_id === form.clientId,
    );
  }, [form.clientId, properties]);

  const selectedProperty = useMemo(
    () =>
      properties.find(
        (property) => property.id === form.propertyId,
      ) ?? null,
    [form.propertyId, properties],
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!estimate || isSaving) {
      return;
    }

    if (estimate.converted_job_id) {
      setErrorMessage(
        "This estimate has already been converted.",
      );
      return;
    }

    if (
      !form.clientId ||
      !form.jobTitle.trim() ||
      !form.description.trim()
    ) {
      setErrorMessage(
        "Customer, work-order title, and scope are required.",
      );
      return;
    }

    const estimatedPrice = Number(form.estimatedPrice);

    if (
      form.estimatedPrice &&
      (!Number.isFinite(estimatedPrice) ||
        estimatedPrice < 0)
    ) {
      setErrorMessage(
        "Estimated price must be a valid nonnegative number.",
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const { data: createdJob, error: jobError } =
      await supabase
        .from("jobs")
        .insert({
          client_id: form.clientId,
          property_id: form.propertyId || null,
          service_id: form.serviceId || null,
          assigned_employee_id:
            form.employeeId || null,
          job_title: form.jobTitle.trim(),
          description: form.description.trim(),
          job_status: form.scheduledStart
            ? "scheduled"
            : "new",
          priority: form.priority,
          scheduled_start: form.scheduledStart
            ? new Date(
                form.scheduledStart,
              ).toISOString()
            : null,
          estimated_price: form.estimatedPrice
            ? estimatedPrice
            : null,
          materials_cost: null,
        })
        .select("id")
        .single();

    if (jobError || !createdJob) {
      setErrorMessage(
        jobError?.message ||
          "The work order could not be created.",
      );
      setIsSaving(false);
      return;
    }

    const { error: estimateUpdateError } =
      await supabase
        .from("estimate_requests")
        .update({
          client_id: form.clientId,
          property_id: form.propertyId || null,
          service_id: form.serviceId || null,
          estimate_status: "converted",
          converted_job_id: createdJob.id,
          converted_at: new Date().toISOString(),
        })
        .eq("id", estimateId)
        .is("converted_job_id", null);

    if (estimateUpdateError) {
      await supabase
        .from("jobs")
        .delete()
        .eq("id", createdJob.id);

      setErrorMessage(
        `The estimate could not be marked converted. The new work order was rolled back. ${estimateUpdateError.message}`,
      );
      setIsSaving(false);
      return;
    }

    await supabase.from("activity_log").insert({
      actor_profile_id: null,
      action: "estimate_converted_to_work_order",
      activity_type: "work_order_created",
      entity_type: "job",
      entity_id: createdJob.id,
      metadata: {
        estimate_id: estimateId,
        label: "Estimate Converted",
        message:
          "Work order created from an approved estimate.",
        estimated_price: form.estimatedPrice
          ? estimatedPrice
          : null,
      },
    });

    router.push(`/work-orders/${createdJob.id}`);
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">
          Loading estimate conversion…
        </p>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div>
        <Link
          href="/admin/estimates"
          className="text-sm font-black text-bakerssPink"
        >
          ← Back to Estimates
        </Link>

        <div className="mt-6 rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black">
            Estimate not found
          </h1>
        </div>
      </div>
    );
  }

  if (estimate.converted_job_id) {
    return (
      <div>
        <Link
          href="/admin/estimates"
          className="text-sm font-black text-bakerssPink"
        >
          ← Back to Estimates
        </Link>

        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-green-700">
            Already Converted
          </p>

          <h1 className="mt-2 text-2xl font-black text-green-950">
            This estimate already has a work order.
          </h1>

          <Link
            href={`/work-orders/${estimate.converted_job_id}`}
            className="mt-6 inline-block rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white"
          >
            Open Work Order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main>
      <div className="mb-6">
        <Link
          href={`/admin/estimates/${estimateId}`}
          className="text-sm font-black text-bakerssPink"
        >
          ← Back to Estimate
        </Link>

        <p className="mt-5 text-sm font-black uppercase tracking-wide text-bakerssPink">
          Sales Conversion
        </p>

        <h1 className="mt-1 text-3xl font-black">
          Convert Estimate to Work Order
        </h1>

        <p className="mt-2 max-w-3xl text-gray-600">
          Confirm the customer, property, approved scope,
          price, assignment, and schedule. The estimate
          will be locked to the new work order after
          conversion.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border bg-white p-6 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Customer" required>
              <select
                value={form.clientId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    clientId: event.target.value,
                    propertyId: "",
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                required
              >
                <option value="">Select customer</option>
                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.client_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Property">
              <select
                value={form.propertyId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    propertyId: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              >
                <option value="">No property selected</option>
                {filteredProperties.map((property) => (
                  <option
                    key={property.id}
                    value={property.id}
                  >
                    {formatProperty(property)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Service">
              <select
                value={form.serviceId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serviceId: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              >
                <option value="">No service selected</option>
                {services.map((service) => (
                  <option
                    key={service.id}
                    value={service.id}
                  >
                    {service.service_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assigned Technician">
              <select
                value={form.employeeId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    employeeId: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              >
                <option value="">Unassigned</option>
                {employees.map((employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="md:col-span-2">
              <Field label="Work-Order Title" required>
                <input
                  value={form.jobTitle}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      jobTitle: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  required
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Approved Scope of Work" required>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={9}
                  className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3"
                  required
                />
              </Field>
            </div>

            <Field label="Scheduled Start">
              <input
                type="datetime-local"
                value={form.scheduledStart}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scheduledStart: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>

            <Field label="Priority">
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>

            <Field label="Approved Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedPrice}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    estimatedPrice: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </Field>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link
              href={`/admin/estimates/${estimateId}`}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-black text-gray-800"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-bakerssPink px-6 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {isSaving
                ? "Creating Work Order…"
                : "Create Work Order"}
            </button>
          </div>
        </form>

        <aside className="space-y-5">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Conversion Summary
            </p>

            <dl className="mt-5 space-y-4">
              <SummaryItem
                label="Estimate Status"
                value={
                  stringValue(
                    estimate.estimate_status,
                  ) || "Draft"
                }
              />

              <SummaryItem
                label="Work-Order Status"
                value={
                  form.scheduledStart
                    ? "Scheduled"
                    : "New"
                }
              />

              <SummaryItem
                label="Approved Price"
                value={
                  form.estimatedPrice
                    ? formatCurrency(
                        Number(form.estimatedPrice),
                      )
                    : "Not entered"
                }
              />

              <SummaryItem
                label="Property"
                value={
                  selectedProperty
                    ? formatProperty(selectedProperty)
                    : "No property"
                }
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <p className="text-sm font-black text-amber-950">
              Duplicate Protection
            </p>

            <p className="mt-2 text-sm font-bold leading-6 text-amber-800">
              Once conversion succeeds, the estimate stores
              the new work-order ID and cannot be converted
              again through this page.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-black text-gray-800">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 font-black text-gray-950">
        {value}
      </dd>
    </div>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstString(
  estimate: GenericEstimate,
  keys: string[],
) {
  for (const key of keys) {
    const value = estimate[key];
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }
  return "";
}

function inferTitle(estimate: GenericEstimate) {
  return (
    firstString(estimate, [
      "estimate_title",
      "title",
      "service_name",
      "service_type",
      "requested_service",
      "subject",
    ]) || "Approved Estimate Work"
  );
}

function inferDescription(
  estimate: GenericEstimate,
) {
  return firstString(estimate, [
    "scope_of_work",
    "description",
    "project_description",
    "request_details",
    "details",
    "notes",
    "message",
  ]);
}

function inferPrice(estimate: GenericEstimate) {
  const keys = [
    "estimated_total",
    "total_amount",
    "estimate_amount",
    "approved_amount",
    "price",
    "amount",
  ];

  for (const key of keys) {
    const value = estimate[key];
    const numericValue = Number(value);
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(numericValue)
    ) {
      return numericValue.toFixed(2);
    }
  }

  return "";
}

function inferClientId(
  estimate: GenericEstimate,
  clients: Client[],
) {
  const customerName = firstString(estimate, [
    "client_name",
    "customer_name",
    "name",
  ]).toLowerCase();

  if (!customerName) {
    return "";
  }

  return (
    clients.find(
      (client) =>
        client.client_name.toLowerCase() ===
        customerName,
    )?.id ?? ""
  );
}

function inferPropertyId(
  estimate: GenericEstimate,
  properties: Property[],
  clientId: string,
) {
  const address = firstString(estimate, [
    "property_address",
    "service_address",
    "address",
    "street_address",
  ]).toLowerCase();

  if (!address) {
    return "";
  }

  return (
    properties.find((property) => {
      if (
        clientId &&
        property.client_id &&
        property.client_id !== clientId
      ) {
        return false;
      }

      return property.street_address
        ?.toLowerCase()
        .includes(address);
    })?.id ?? ""
  );
}

function inferServiceId(
  estimate: GenericEstimate,
  services: Service[],
) {
  const serviceName = firstString(estimate, [
    "service_name",
    "service_type",
    "requested_service",
  ]).toLowerCase();

  if (!serviceName) {
    return "";
  }

  return (
    services.find(
      (service) =>
        service.service_name.toLowerCase() ===
          serviceName ||
        serviceName.includes(
          service.service_name.toLowerCase(),
        ),
    )?.id ?? ""
  );
}

function formatProperty(property: Property) {
  return (
    property.property_name ||
    [
      property.street_address,
      property.city,
      property.state,
    ]
      .filter(Boolean)
      .join(", ") ||
    "Unnamed property"
  );
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}