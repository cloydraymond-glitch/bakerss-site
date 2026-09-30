"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
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
};

type RecurringServiceForm = {
  clientId: string;
  propertyId: string;
  serviceId: string;
  serviceName: string;
  frequency: string;
  preferredDay: string;
  preferredTime: string;
  startDate: string;
  endDate: string;
  pricePerVisit: string;
  monthlyPrice: string;
  internalNotes: string;
  clientVisibleNotes: string;
  generateNow: boolean;
};

const initialForm: RecurringServiceForm = {
  clientId: "",
  propertyId: "",
  serviceId: "",
  serviceName: "",
  frequency: "weekly",
  preferredDay: "",
  preferredTime: "",
  startDate: getTodayInput(),
  endDate: "",
  pricePerVisit: "",
  monthlyPrice: "",
  internalNotes: "",
  clientVisibleNotes: "",
  generateNow: true,
};

const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Every 6 Months" },
  { value: "annual", label: "Annual" },
];

const dayOptions = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function NewRecurringServicePage() {
  const router = useRouter();

  const [form, setForm] =
    useState<RecurringServiceForm>(initialForm);

  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadFormData() {
      setIsLoading(true);
      setErrorMessage("");

      const [
        clientsResponse,
        propertiesResponse,
        servicesResponse,
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
          .select("id, service_name")
          .order("service_name", { ascending: true }),
      ]);

      const firstError =
        clientsResponse.error ||
        propertiesResponse.error ||
        servicesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
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

      setIsLoading(false);
    }

    void loadFormData();
  }, []);

  const filteredProperties = useMemo(() => {
    if (!form.clientId) {
      return properties;
    }

    return properties.filter(
      (property) => property.client_id === form.clientId,
    );
  }, [form.clientId, properties]);

  function updateForm<K extends keyof RecurringServiceForm>(
    field: K,
    value: RecurringServiceForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleClientChange(clientId: string) {
    const selectedProperty = properties.find(
      (property) =>
        property.id === form.propertyId &&
        property.client_id === clientId,
    );

    setForm((current) => ({
      ...current,
      clientId,
      propertyId: selectedProperty
        ? current.propertyId
        : "",
    }));
  }

  function handleServiceChange(serviceId: string) {
    const selectedService = services.find(
      (service) => service.id === serviceId,
    );

    setForm((current) => ({
      ...current,
      serviceId,
      serviceName:
        selectedService?.service_name ??
        current.serviceName,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const cleanServiceName = form.serviceName.trim();

    if (!form.clientId) {
      setErrorMessage("Select a client.");
      return;
    }

    if (!form.propertyId) {
      setErrorMessage("Select a property.");
      return;
    }

    if (!cleanServiceName) {
      setErrorMessage("Enter or select a service name.");
      return;
    }

    if (!form.frequency) {
      setErrorMessage("Select a service frequency.");
      return;
    }

    if (!form.startDate) {
      setErrorMessage("Select a start date.");
      return;
    }

    if (
      form.endDate &&
      form.endDate < form.startDate
    ) {
      setErrorMessage(
        "The end date cannot be before the start date.",
      );
      return;
    }

    setIsSaving(true);

    const pricePerVisit =
      form.pricePerVisit.trim() === ""
        ? null
        : Number(form.pricePerVisit);

    const monthlyPrice =
      form.monthlyPrice.trim() === ""
        ? null
        : Number(form.monthlyPrice);

    if (
      pricePerVisit !== null &&
      (!Number.isFinite(pricePerVisit) ||
        pricePerVisit < 0)
    ) {
      setErrorMessage(
        "Price per visit must be a valid positive number.",
      );
      setIsSaving(false);
      return;
    }

    if (
      monthlyPrice !== null &&
      (!Number.isFinite(monthlyPrice) ||
        monthlyPrice < 0)
    ) {
      setErrorMessage(
        "Monthly price must be a valid positive number.",
      );
      setIsSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("recurring_services")
      .insert({
        client_id: form.clientId,
        property_id: form.propertyId,
        service_id: form.serviceId || null,
        service_name: cleanServiceName,
        frequency: form.frequency,
        preferred_day:
          form.preferredDay || null,
        preferred_time:
          form.preferredTime || null,
        start_date: form.startDate,
        end_date: form.endDate || null,
        price_per_visit: pricePerVisit,
        monthly_price: monthlyPrice,
        active: true,
        internal_notes:
          form.internalNotes.trim() || null,
        client_visible_notes:
          form.clientVisibleNotes.trim() || null,
      })
      .select("id, service_name")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    if (form.generateNow) {
      const throughDate = addDaysToDateInput(90);

      const { data: generatedCount, error: generationError } =
        await supabase.rpc(
          "generate_recurring_service_occurrences",
          {
            p_recurring_service_id: data.id,
            p_through_date: throughDate,
          },
        );

      if (generationError) {
        setErrorMessage(
          `The recurring service was created, but its visits could not be generated: ${generationError.message}`,
        );

        setIsSaving(false);
        return;
      }

      const count = Number(generatedCount ?? 0);

      setSuccessMessage(
        `${data.service_name} was created with ${count} upcoming visit${
          count === 1 ? "" : "s"
        }.`,
      );
    } else {
      setSuccessMessage(
        `${data.service_name} was created successfully.`,
      );
    }

    setTimeout(() => {
      router.push("/recurring");
      router.refresh();
    }, 900);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-black">
            Add Recurring Service
          </h1>

          <p className="mt-2 text-gray-600">
            Loading clients, properties, and services…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-pink-600">
            Scheduling
          </p>

          <h1 className="mt-1 text-3xl font-black text-gray-950">
            Add Recurring Service
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Create a repeating service agreement and generate its
            upcoming service dates.
          </p>
        </div>

        <Link
          href="/recurring"
          className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"
        >
          Back to Recurring Services
        </Link>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {successMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-gray-950">
              Client and Property
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Select where this repeating service will be performed.
            </p>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Client" required>
              <select
                value={form.clientId}
                onChange={(event) =>
                  handleClientChange(event.target.value)
                }
                className={inputClassName}
                required
              >
                <option value="">Select a client</option>

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

            <Field label="Property" required>
              <select
                value={form.propertyId}
                onChange={(event) =>
                  updateForm(
                    "propertyId",
                    event.target.value,
                  )
                }
                className={inputClassName}
                required
              >
                <option value="">Select a property</option>

                {filteredProperties.map((property) => (
                  <option
                    key={property.id}
                    value={property.id}
                  >
                    {formatPropertyOption(property)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-gray-950">
              Service Schedule
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Set the service type, frequency, preferred day, and
              start date.
            </p>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Service Catalog">
              <select
                value={form.serviceId}
                onChange={(event) =>
                  handleServiceChange(event.target.value)
                }
                className={inputClassName}
              >
                <option value="">
                  Select from service catalog
                </option>

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

            <Field label="Recurring Service Name" required>
              <input
                type="text"
                value={form.serviceName}
                onChange={(event) =>
                  updateForm(
                    "serviceName",
                    event.target.value,
                  )
                }
                placeholder="Example: Weekly Lawn Care"
                className={inputClassName}
                required
              />
            </Field>

            <Field label="Frequency" required>
              <select
                value={form.frequency}
                onChange={(event) =>
                  updateForm(
                    "frequency",
                    event.target.value,
                  )
                }
                className={inputClassName}
                required
              >
                {frequencyOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Preferred Day">
              <select
                value={form.preferredDay}
                onChange={(event) =>
                  updateForm(
                    "preferredDay",
                    event.target.value,
                  )
                }
                className={inputClassName}
              >
                <option value="">
                  No preferred day
                </option>

                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Preferred Time">
              <input
                type="time"
                value={form.preferredTime}
                onChange={(event) =>
                  updateForm(
                    "preferredTime",
                    event.target.value,
                  )
                }
                className={inputClassName}
              />
            </Field>

            <Field label="Start Date" required>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  updateForm(
                    "startDate",
                    event.target.value,
                  )
                }
                className={inputClassName}
                required
              />
            </Field>

            <Field label="End Date">
              <input
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(event) =>
                  updateForm(
                    "endDate",
                    event.target.value,
                  )
                }
                className={inputClassName}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-gray-950">
              Pricing
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Enter either per-visit pricing, monthly pricing, or both.
            </p>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Price Per Visit">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerVisit}
                onChange={(event) =>
                  updateForm(
                    "pricePerVisit",
                    event.target.value,
                  )
                }
                placeholder="0.00"
                className={inputClassName}
              />
            </Field>

            <Field label="Monthly Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyPrice}
                onChange={(event) =>
                  updateForm(
                    "monthlyPrice",
                    event.target.value,
                  )
                }
                placeholder="0.00"
                className={inputClassName}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-gray-950">
              Service Notes
            </h2>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Field label="Internal Notes">
              <textarea
                value={form.internalNotes}
                onChange={(event) =>
                  updateForm(
                    "internalNotes",
                    event.target.value,
                  )
                }
                placeholder="Crew instructions, gate codes, route notes, or internal requirements."
                rows={5}
                className={inputClassName}
              />
            </Field>

            <Field label="Client-Visible Notes">
              <textarea
                value={form.clientVisibleNotes}
                onChange={(event) =>
                  updateForm(
                    "clientVisibleNotes",
                    event.target.value,
                  )
                }
                placeholder="Service scope or notes that may be shown to the client."
                rows={5}
                className={inputClassName}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.generateNow}
              onChange={(event) =>
                updateForm(
                  "generateNow",
                  event.target.checked,
                )
              }
              className="mt-1 h-5 w-5 rounded border-gray-300"
            />

            <span>
              <span className="block font-black text-gray-950">
                Generate the next 90 days immediately
              </span>

              <span className="mt-1 block text-sm text-gray-600">
                Upcoming service occurrences will be created as soon
                as this recurring service is saved.
              </span>
            </span>
          </label>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href="/recurring"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Creating Recurring Service…"
              : "Create Recurring Service"}
          </button>
        </div>
      </form>
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
    <label className="block">
      <span className="mb-2 block text-sm font-black text-gray-800">
        {label}
        {required && (
          <span className="ml-1 text-pink-600">*</span>
        )}
      </span>

      {children}
    </label>
  );
}

function formatPropertyOption(property: Property) {
  const name =
    property.property_name?.trim() ||
    property.street_address?.trim() ||
    "Unnamed property";

  const location = [property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return location ? `${name} — ${location}` : name;
}

function getTodayInput() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDateInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const inputClassName =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100";