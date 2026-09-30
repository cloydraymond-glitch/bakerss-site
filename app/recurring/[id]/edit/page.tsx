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
import { supabase } from "../../../../lib/supabase/client";

type ClientOption = {
  id: string;
  client_name: string;
};

type PropertyOption = {
  id: string;
  client_id: string | null;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
};

type ServiceOption = {
  id: string;
  service_name: string;
};

type RecurringServiceRecord = {
  id: string;
  client_id: string | null;
  property_id: string | null;
  service_id: string | null;
  service_name: string;
  frequency: string;
  preferred_day: string | null;
  preferred_time: string | null;
  start_date: string | null;
  end_date: string | null;
  price_per_visit: number | null;
  monthly_price: number | null;
  active: boolean | null;
  internal_notes: string | null;
  client_visible_notes: string | null;
};

type FormState = {
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
  active: boolean;
};

const initialFormState: FormState = {
  clientId: "",
  propertyId: "",
  serviceId: "",
  serviceName: "",
  frequency: "weekly",
  preferredDay: "monday",
  preferredTime: "09:00",
  startDate: "",
  endDate: "",
  pricePerVisit: "",
  monthlyPrice: "",
  internalNotes: "",
  clientVisibleNotes: "",
  active: true,
};

export default function EditRecurringServicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const recurringServiceId = params?.id ?? "";

  const [form, setForm] = useState<FormState>(initialFormState);
  const [originalRecord, setOriginalRecord] =
    useState<RecurringServiceRecord | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPage = useCallback(async () => {
    if (!recurringServiceId) {
      setErrorMessage("Recurring service ID is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const [
      recurringResponse,
      clientsResponse,
      propertiesResponse,
      servicesResponse,
    ] = await Promise.all([
      supabase
        .from("recurring_services")
        .select(`
          id,
          client_id,
          property_id,
          service_id,
          service_name,
          frequency,
          preferred_day,
          preferred_time,
          start_date,
          end_date,
          price_per_visit,
          monthly_price,
          active,
          internal_notes,
          client_visible_notes
        `)
        .eq("id", recurringServiceId)
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
    ]);

    const firstError =
      recurringResponse.error ||
      clientsResponse.error ||
      propertiesResponse.error ||
      servicesResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const record =
      recurringResponse.data as RecurringServiceRecord;

    setOriginalRecord(record);

    setClients((clientsResponse.data ?? []) as ClientOption[]);
    setProperties(
      (propertiesResponse.data ?? []) as PropertyOption[],
    );
    setServices((servicesResponse.data ?? []) as ServiceOption[]);

    setForm({
      clientId: record.client_id ?? "",
      propertyId: record.property_id ?? "",
      serviceId: record.service_id ?? "",
      serviceName: record.service_name ?? "",
      frequency: record.frequency ?? "weekly",
      preferredDay: record.preferred_day ?? "monday",
      preferredTime: normalizeTime(record.preferred_time),
      startDate: record.start_date ?? "",
      endDate: record.end_date ?? "",
      pricePerVisit:
        record.price_per_visit === null
          ? ""
          : String(record.price_per_visit),
      monthlyPrice:
        record.monthly_price === null
          ? ""
          : String(record.monthly_price),
      internalNotes: record.internal_notes ?? "",
      clientVisibleNotes: record.client_visible_notes ?? "",
      active: record.active !== false,
    });

    setIsLoading(false);
  }, [recurringServiceId]);

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

  const scheduleChanged = useMemo(() => {
    if (!originalRecord) {
      return false;
    }

    return (
      form.frequency !== (originalRecord.frequency ?? "") ||
      form.preferredDay !==
        (originalRecord.preferred_day ?? "") ||
      normalizeTime(form.preferredTime) !==
        normalizeTime(originalRecord.preferred_time) ||
      form.startDate !== (originalRecord.start_date ?? "") ||
      form.endDate !== (originalRecord.end_date ?? "")
    );
  }, [form, originalRecord]);

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
    const selectedPropertyStillValid = properties.some(
      (property) =>
        property.id === form.propertyId &&
        (!property.client_id ||
          property.client_id === clientId),
    );

    setForm((current) => ({
      ...current,
      clientId,
      propertyId: selectedPropertyStillValid
        ? current.propertyId
        : "",
    }));
  }

  function handleServiceCatalogChange(serviceId: string) {
    const selectedService = services.find(
      (service) => service.id === serviceId,
    );

    setForm((current) => ({
      ...current,
      serviceId,
      serviceName:
        selectedService?.service_name ?? current.serviceName,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!recurringServiceId) {
      setErrorMessage("Recurring service ID is missing.");
      return;
    }

    if (!form.serviceName.trim()) {
      setErrorMessage("Service name is required.");
      return;
    }

    if (!form.frequency) {
      setErrorMessage("Frequency is required.");
      return;
    }

    if (!form.startDate) {
      setErrorMessage("Start date is required.");
      return;
    }

    if (
      form.endDate &&
      form.endDate < form.startDate
    ) {
      setErrorMessage(
        "End date cannot be earlier than the start date.",
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const pricePerVisit = parseOptionalNumber(
      form.pricePerVisit,
    );

    const monthlyPrice = parseOptionalNumber(
      form.monthlyPrice,
    );

    if (pricePerVisit === "invalid") {
      setErrorMessage(
        "Price per visit must be a valid number.",
      );
      setIsSaving(false);
      return;
    }

    if (monthlyPrice === "invalid") {
      setErrorMessage(
        "Monthly price must be a valid number.",
      );
      setIsSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("recurring_services")
      .update({
        client_id: form.clientId || null,
        property_id: form.propertyId || null,
        service_id: form.serviceId || null,
        service_name: form.serviceName.trim(),
        frequency: form.frequency,
        preferred_day: form.preferredDay || null,
        preferred_time: form.preferredTime || null,
        start_date: form.startDate,
        end_date: form.endDate || null,
        price_per_visit: pricePerVisit,
        monthly_price: monthlyPrice,
        active: form.active,
        internal_notes: form.internalNotes.trim() || null,
        client_visible_notes:
          form.clientVisibleNotes.trim() || null,
      })
      .eq("id", recurringServiceId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setIsSaving(false);
      return;
    }

    if (scheduleChanged) {
      const today = getTodayInput();

      const { error: deleteError } = await supabase
        .from("recurring_service_occurrences")
        .delete()
        .eq("recurring_service_id", recurringServiceId)
        .is("job_id", null)
        .gte("scheduled_date", today);

      if (deleteError) {
        setErrorMessage(
          `The service was updated, but future unlinked visits could not be cleared: ${deleteError.message}`,
        );
        setIsSaving(false);
        return;
      }

      const { error: generationError } = await supabase.rpc(
        "generate_recurring_service_occurrences",
        {
          p_recurring_service_id: recurringServiceId,
          p_through_date: addDaysToDateInput(90),
        },
      );

      if (generationError) {
        setErrorMessage(
          `The service was updated, but new visits could not be generated: ${generationError.message}`,
        );
        setIsSaving(false);
        return;
      }
    }

    setSuccessMessage(
      scheduleChanged
        ? "Recurring service updated. Future unlinked visits were regenerated, and existing linked jobs were preserved."
        : "Recurring service updated successfully.",
    );

    setIsSaving(false);

    window.setTimeout(() => {
      router.push("/recurring");
      router.refresh();
    }, 900);
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-black">
            Edit Recurring Service
          </h1>

          <p className="mt-2 text-gray-600">
            Loading recurring service…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-pink-600">
            Recurring Services
          </p>

          <h1 className="mt-1 text-3xl font-black text-gray-950">
            Edit Recurring Service
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Update the agreement, schedule, pricing, and notes.
            Existing work orders remain intact.
          </p>
        </div>

        <Link
          href="/recurring"
          className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"
        >
          Back to Recurring
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

      {scheduleChanged && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Schedule changes detected. Saving will replace future
          unlinked visits and preserve visits already linked to
          work orders.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-950">
            Client and Service
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Client">
              <select
                value={form.clientId}
                onChange={(event) =>
                  handleClientChange(event.target.value)
                }
                className={inputClassName}
              >
                <option value="">No client selected</option>

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
                  updateField(
                    "propertyId",
                    event.target.value,
                  )
                }
                className={inputClassName}
              >
                <option value="">No property selected</option>

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

            <Field label="Service Catalog">
              <select
                value={form.serviceId}
                onChange={(event) =>
                  handleServiceCatalogChange(
                    event.target.value,
                  )
                }
                className={inputClassName}
              >
                <option value="">
                  No catalog service selected
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

            <Field
              label="Service Name"
              required
            >
              <input
                type="text"
                value={form.serviceName}
                onChange={(event) =>
                  updateField(
                    "serviceName",
                    event.target.value,
                  )
                }
                className={inputClassName}
                placeholder="Example: Lawn Care"
                required
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-950">
            Schedule
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Frequency"
              required
            >
              <select
                value={form.frequency}
                onChange={(event) =>
                  updateField(
                    "frequency",
                    event.target.value,
                  )
                }
                className={inputClassName}
                required
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">
                  Every Two Weeks
                </option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semiannual">
                  Every Six Months
                </option>
                <option value="annual">Annual</option>
              </select>
            </Field>

            <Field label="Preferred Day">
              <select
                value={form.preferredDay}
                onChange={(event) =>
                  updateField(
                    "preferredDay",
                    event.target.value,
                  )
                }
                className={inputClassName}
              >
                <option value="">Not specified</option>
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">
                  Wednesday
                </option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
            </Field>

            <Field label="Preferred Time">
              <input
                type="time"
                value={form.preferredTime}
                onChange={(event) =>
                  updateField(
                    "preferredTime",
                    event.target.value,
                  )
                }
                className={inputClassName}
              />
            </Field>

            <Field
              label="Start Date"
              required
            >
              <input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  updateField(
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
                min={form.startDate || undefined}
                onChange={(event) =>
                  updateField(
                    "endDate",
                    event.target.value,
                  )
                }
                className={inputClassName}
              />
            </Field>

            <Field label="Status">
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-gray-300 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    updateField(
                      "active",
                      event.target.checked,
                    )
                  }
                  className="h-5 w-5 accent-pink-600"
                />

                <span className="text-sm font-bold text-gray-800">
                  Active recurring service
                </span>
              </label>
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-950">
            Pricing
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Price Per Visit">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerVisit}
                onChange={(event) =>
                  updateField(
                    "pricePerVisit",
                    event.target.value,
                  )
                }
                className={inputClassName}
                placeholder="0.00"
              />
            </Field>

            <Field label="Monthly Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyPrice}
                onChange={(event) =>
                  updateField(
                    "monthlyPrice",
                    event.target.value,
                  )
                }
                className={inputClassName}
                placeholder="0.00"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-950">
            Notes
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Internal Notes">
              <textarea
                value={form.internalNotes}
                onChange={(event) =>
                  updateField(
                    "internalNotes",
                    event.target.value,
                  )
                }
                className={`${inputClassName} min-h-36 resize-y`}
                placeholder="Visible only to your team"
              />
            </Field>

            <Field label="Client-Visible Notes">
              <textarea
                value={form.clientVisibleNotes}
                onChange={(event) =>
                  updateField(
                    "clientVisibleNotes",
                    event.target.value,
                  )
                }
                className={`${inputClassName} min-h-36 resize-y`}
                placeholder="Information that may be shared with the client"
              />
            </Field>
          </div>
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
            className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-black text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Saving Changes…"
              : "Save Changes"}
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
        {required ? (
          <span className="ml-1 text-pink-600">*</span>
        ) : null}
      </span>

      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100";

function normalizeTime(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 5);
}

function parseOptionalNumber(
  value: string,
): number | null | "invalid" {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (
    Number.isNaN(parsedValue) ||
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    return "invalid";
  }

  return parsedValue;
}

function formatPropertyOption(
  property: PropertyOption,
) {
  const name =
    property.property_name?.trim() ||
    property.street_address?.trim() ||
    "Property";

  const location = [
    property.street_address &&
    property.street_address !== name
      ? property.street_address
      : null,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(" · ");

  return location ? `${name} · ${location}` : name;
}

function getTodayInput() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(
    2,
    "0",
  );
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDateInput(days: number) {
  const date = new Date();

  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0",
  );
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}