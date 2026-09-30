"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

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
  default_duration_minutes: number | null;
};

type Employee = {
  id: string;
  full_name: string;
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
  estimatedDurationMinutes: string;
  description: string;
};

const initialFormState: FormState = {
  jobTitle: "",
  clientId: "",
  propertyId: "",
  serviceId: "",
  employeeId: "",
  jobStatus: "new",
  priority: "normal",
  scheduledStart: "",
  estimatedPrice: "",
  estimatedDurationMinutes: "",
  description: "",
};

export default function NewWorkOrderPage() {
  const router = useRouter();

  const [form, setForm] =
    useState<FormState>(initialFormState);

  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] =
    useState<Property[]>([]);
  const [services, setServices] =
    useState<Service[]>([]);
  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [isLoadingOptions, setIsLoadingOptions] =
    useState(true);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    async function loadFormOptions() {
      setIsLoadingOptions(true);
      setErrorMessage("");

      const [
        clientsResponse,
        propertiesResponse,
        servicesResponse,
        employeesResponse,
      ] = await Promise.all([
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
          .select(`
            id,
            service_name,
            default_duration_minutes
          `)
          .order("service_name", { ascending: true }),

        supabase
          .from("employees")
          .select("id, full_name")
          .order("full_name", { ascending: true }),
      ]);

      const firstError =
        clientsResponse.error ||
        propertiesResponse.error ||
        servicesResponse.error ||
        employeesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoadingOptions(false);
        return;
      }

      setClients(
        (clientsResponse.data ?? []) as Client[],
      );
      setProperties(
        (propertiesResponse.data ?? []) as Property[],
      );
      setServices(
        (servicesResponse.data ?? []) as Service[],
      );
      setEmployees(
        (employeesResponse.data ?? []) as Employee[],
      );

      setIsLoadingOptions(false);
    }

    void loadFormOptions();
  }, []);

  const filteredProperties = useMemo(() => {
    if (!form.clientId) {
      return properties;
    }

    return properties.filter(
      (property) =>
        property.client_id === form.clientId,
    );
  }, [form.clientId, properties]);

  const selectedService = useMemo(
    () =>
      services.find(
        (service) => service.id === form.serviceId,
      ) ?? null,
    [form.serviceId, services],
  );

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
    setForm((current) => ({
      ...current,
      clientId,
      propertyId: "",
    }));
  }

  function handleServiceChange(serviceId: string) {
    const service =
      services.find(
        (item) => item.id === serviceId,
      ) ?? null;

    setForm((current) => ({
      ...current,
      serviceId,
      estimatedDurationMinutes:
        service?.default_duration_minutes?.toString() ??
        "",
    }));
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

    return `${primaryLabel} - ${location}`;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setErrorMessage("");

    if (!form.jobTitle.trim()) {
      setErrorMessage(
        "Enter a work-order title.",
      );
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
      (!Number.isFinite(estimatedPrice) ||
        estimatedPrice < 0)
    ) {
      setErrorMessage(
        "Enter a valid estimated price.",
      );
      return;
    }

    const estimatedDurationMinutes =
      form.estimatedDurationMinutes.trim() === ""
        ? null
        : Number(form.estimatedDurationMinutes);

    if (
      estimatedDurationMinutes !== null &&
      (!Number.isInteger(estimatedDurationMinutes) ||
        estimatedDurationMinutes < 15 ||
        estimatedDurationMinutes > 1440)
    ) {
      setErrorMessage(
        "Estimated duration must be a whole number from 15 to 1440 minutes.",
      );
      return;
    }

    setIsSubmitting(true);

    const insertData = {
      job_title: form.jobTitle.trim(),
      client_id: form.clientId,
      property_id: form.propertyId || null,
      service_id: form.serviceId || null,
      assigned_employee_id:
        form.employeeId || null,
      job_status: form.jobStatus,
      priority: form.priority,
      scheduled_start: form.scheduledStart
        ? new Date(
            form.scheduledStart,
          ).toISOString()
        : null,
      estimated_price: estimatedPrice,
      estimated_duration_minutes:
        estimatedDurationMinutes,
      description:
        form.description.trim() || null,
    };

    const { error } = await supabase
      .from("jobs")
      .insert(insertData);

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/work-orders");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black">
            New Work Order
          </h1>

          <p className="mt-1 text-gray-600">
            Create, schedule, and assign a new
            customer job.
          </p>
        </div>

        <Link
          href="/work-orders"
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
        >
          Back to Work Orders
        </Link>
      </div>

      {errorMessage && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {isLoadingOptions ? (
        <div className="mt-6 rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="font-bold">
            Loading customers and job options...
          </p>
        </div>
      ) : (
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
                updateField(
                  "jobTitle",
                  event.target.value,
                )
              }
              placeholder="Example: Repair leaking kitchen faucet"
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
                  handleClientChange(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                required
              >
                <option value="">
                  Select a customer
                </option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.client_name}
                  </option>
                ))}
              </select>

              {clients.length === 0 && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  No customers were returned from the
                  clients table.
                </p>
              )}
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
                  updateField(
                    "propertyId",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="">
                  Select a property
                </option>

                {filteredProperties.map(
                  (property) => (
                    <option
                      key={property.id}
                      value={property.id}
                    >
                      {formatPropertyLabel(
                        property,
                      )}
                    </option>
                  ),
                )}
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
                  handleServiceChange(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="">
                  Select a service
                </option>

                {services.map((service) => (
                  <option
                    key={service.id}
                    value={service.id}
                  >
                    {service.service_name}
                    {service.default_duration_minutes
                      ? ` (${formatDuration(
                          service.default_duration_minutes,
                        )})`
                      : ""}
                  </option>
                ))}
              </select>

              {selectedService?.default_duration_minutes && (
                <p className="mt-2 text-xs font-bold text-blue-700">
                  Service default:{" "}
                  {formatDuration(
                    selectedService.default_duration_minutes,
                  )}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="employeeId"
                className="mb-2 block text-sm font-black text-gray-800"
              >
                Assigned Technician
              </label>

              <select
                id="employeeId"
                value={form.employeeId}
                onChange={(event) =>
                  updateField(
                    "employeeId",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="">
                  Unassigned
                </option>

                {employees.map((employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
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
                  updateField(
                    "jobStatus",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="new">New</option>
                <option value="scheduled">
                  Scheduled
                </option>
                <option value="in_progress">
                  In Progress
                </option>
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
                  updateField(
                    "priority",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="low">Low</option>
                <option value="normal">
                  Normal
                </option>
                <option value="high">High</option>
                <option value="urgent">
                  Urgent
                </option>
              </select>
            </div>

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
                  updateField(
                    "scheduledStart",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
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
                  updateField(
                    "estimatedPrice",
                    event.target.value,
                  )
                }
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </div>

            <div>
              <label
                htmlFor="estimatedDurationMinutes"
                className="mb-2 block text-sm font-black text-gray-800"
              >
                Estimated Duration
              </label>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  id="estimatedDurationMinutes"
                  type="number"
                  min="15"
                  max="1440"
                  step="15"
                  value={
                    form.estimatedDurationMinutes
                  }
                  onChange={(event) =>
                    updateField(
                      "estimatedDurationMinutes",
                      event.target.value,
                    )
                  }
                  placeholder="Minutes"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />

                <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
                  Minutes
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Selecting a service automatically loads
                its default duration. You can override it
                for this work order.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-black text-gray-800"
            >
              Description / Scope
            </label>

            <textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(event) =>
                updateField(
                  "description",
                  event.target.value,
                )
              }
              placeholder="Enter scope, access notes, client instructions, materials, or other work-order details."
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-black text-blue-900">
              Dispatch Planning
            </p>
            <p className="mt-1 text-sm text-blue-800">
              When you select a service with a default
              duration, Bakersss OS automatically carries
              that time estimate into this work order.
              Dispatch can still change it later.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/work-orders"
              className="rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-black transition hover:bg-gray-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? "Creating Work Order..."
                : "Create Work Order"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder} min`;
  }

  if (remainder === 0) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  return `${hours}h ${remainder}m`;
}