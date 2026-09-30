"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../../lib/supabase/client";

type GenericEstimate = Record<string, unknown> & {
  id: string;
  client_id?: string | null;
  property_id?: string | null;
  service_id?: string | null;
  estimate_status?: string | null;
  estimate_title?: string | null;
  scope_of_work?: string | null;
  estimated_total?: number | string | null;
  approved_at?: string | null;
  client_response_at?: string | null;
  client_response_note?: string | null;
  converted_job_id?: string | null;
  converted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Client = {
  id: string;
  client_name: string;
};

type Property = {
  id: string;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
};

type Service = {
  id: string;
  service_name: string;
};

type RequestPhoto = {
  id: string;
  request_id: string;
  storage_path: string;
  caption: string | null;
  uploaded_by: string;
  created_at: string | null;
  signed_url?: string;
};

type FormState = {
  clientId: string;
  propertyId: string;
  serviceId: string;
  status: string;
  title: string;
  scope: string;
  total: string;
};

const STATUS_OPTIONS = [
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
  "converted",
];

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const estimateId = params.id;

  const [estimate, setEstimate] =
    useState<GenericEstimate | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] =
    useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [requestPhotos, setRequestPhotos] =
    useState<RequestPhoto[]>([]);
  const [form, setForm] = useState<FormState>({
    clientId: "",
    propertyId: "",
    serviceId: "",
    status: "draft",
    title: "",
    scope: "",
    total: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
      estimateResponse.error ||
      clientsResponse.error ||
      propertiesResponse.error ||
      servicesResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedEstimate =
      estimateResponse.data as GenericEstimate;

    setEstimate(loadedEstimate);
    setClients((clientsResponse.data ?? []) as Client[]);
    setProperties(
      (propertiesResponse.data ?? []) as Property[],
    );
    setServices((servicesResponse.data ?? []) as Service[]);

    const { data: requestPhotoRows, error: requestPhotoError } =
      await supabase
        .from("estimate_request_photos")
        .select("id, request_id, storage_path, caption, uploaded_by, created_at")
        .eq("request_id", estimateId)
        .order("created_at", { ascending: false });

    if (requestPhotoError) {
      setErrorMessage(requestPhotoError.message);
      setIsLoading(false);
      return;
    }

    const signedRequestPhotos = await Promise.all(
      ((requestPhotoRows ?? []) as RequestPhoto[]).map(async (photo) => {
        const { data, error } = await supabase.storage
          .from("request-photos")
          .createSignedUrl(photo.storage_path, 60 * 60);

        if (error || !data?.signedUrl) {
          return photo;
        }

        return { ...photo, signed_url: data.signedUrl };
      }),
    );

    setRequestPhotos(signedRequestPhotos);

    setForm({
      clientId: stringValue(loadedEstimate.client_id),
      propertyId: stringValue(loadedEstimate.property_id),
      serviceId: stringValue(loadedEstimate.service_id),
      status:
        stringValue(loadedEstimate.estimate_status) ||
        "draft",
      title:
        stringValue(loadedEstimate.estimate_title) ||
        firstString(loadedEstimate, [
          "title",
          "service_name",
          "service_type",
          "subject",
        ]),
      scope:
        stringValue(loadedEstimate.scope_of_work) ||
        firstString(loadedEstimate, [
          "description",
          "project_description",
          "request_details",
          "details",
          "notes",
          "message",
        ]),
      total: formatNumericInput(
        loadedEstimate.estimated_total ??
          firstNumber(loadedEstimate, [
            "total_amount",
            "estimate_amount",
            "approved_amount",
            "price",
            "amount",
          ]),
      ),
    });

    setIsLoading(false);
  }, [estimateId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const selectedClient = useMemo(
    () =>
      clients.find(
        (client) => client.id === form.clientId,
      ) ?? null,
    [clients, form.clientId],
  );

  const selectedProperty = useMemo(
    () =>
      properties.find(
        (property) => property.id === form.propertyId,
      ) ?? null,
    [form.propertyId, properties],
  );

  const selectedService = useMemo(
    () =>
      services.find(
        (service) => service.id === form.serviceId,
      ) ?? null,
    [form.serviceId, services],
  );

  async function saveEstimate() {
    if (!estimate || isSaving) {
      return;
    }

    const total = form.total.trim()
      ? Number(form.total)
      : null;

    if (
      total !== null &&
      (!Number.isFinite(total) || total < 0)
    ) {
      setErrorMessage(
        "Estimate total must be a valid nonnegative number.",
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const approvedAt =
      form.status === "approved"
        ? estimate.approved_at ||
          new Date().toISOString()
        : null;

    const { error } = await supabase
      .from("estimate_requests")
      .update({
        client_id: form.clientId || null,
        property_id: form.propertyId || null,
        service_id: form.serviceId || null,
        estimate_status: form.status,
        estimate_title: form.title.trim() || null,
        scope_of_work: form.scope.trim() || null,
        estimated_total: total,
        approved_at: approvedAt,
      })
      .eq("id", estimateId);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage("Estimate updated.");
    await loadPage();
    setIsSaving(false);
  }

  async function markApproved() {
    setForm((current) => ({
      ...current,
      status: "approved",
    }));

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const total = form.total.trim()
      ? Number(form.total)
      : null;

    if (
      total !== null &&
      (!Number.isFinite(total) || total < 0)
    ) {
      setErrorMessage(
        "Estimate total must be a valid nonnegative number.",
      );
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("estimate_requests")
      .update({
        client_id: form.clientId || null,
        property_id: form.propertyId || null,
        service_id: form.serviceId || null,
        estimate_status: "approved",
        estimate_title: form.title.trim() || null,
        scope_of_work: form.scope.trim() || null,
        estimated_total: total,
        approved_at:
          estimate?.approved_at ||
          new Date().toISOString(),
      })
      .eq("id", estimateId);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage("Estimate approved.");
    await loadPage();
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">
          Loading estimate details…
        </p>
      </div>
    );
  }

  if (!estimate) {
    return (
      <main>
        <Link
          href="/admin/estimates"
          className="text-sm font-black text-bakerssPink"
        >
          ← Back to Estimates
        </Link>

        <div className="mt-6 rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-black">
            Estimate Not Found
          </h1>

          {errorMessage && (
            <p className="mt-3 font-bold text-red-700">
              {errorMessage}
            </p>
          )}
        </div>
      </main>
    );
  }

  const isConverted = Boolean(
    estimate.converted_job_id,
  );

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Link
            href="/admin/estimates"
            className="text-sm font-black text-bakerssPink"
          >
            ← Back to Estimates
          </Link>

          <p className="mt-5 text-sm font-black uppercase tracking-wide text-bakerssPink">
            Estimate Management
          </p>

          <h1 className="mt-1 text-3xl font-black">
            {form.title || "Estimate Details"}
          </h1>

          <p className="mt-2 text-gray-600">
            Review scope, pricing, approval, and work-order
            conversion.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {isConverted ? (
            <Link
              href={`/work-orders/${estimate.converted_job_id}`}
              className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white"
            >
              Open Work Order
            </Link>
          ) : (
            <Link
              href={`/admin/estimates/${estimateId}/convert`}
              className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white"
            >
              Convert to Work Order
            </Link>
          )}

          <button
            type="button"
            onClick={() => void saveEstimate()}
            disabled={isSaving || isConverted}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Estimate"}
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

      {isConverted && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <p className="text-xs font-black uppercase tracking-wide text-green-700">
            Conversion Complete
          </p>

          <h2 className="mt-2 text-xl font-black text-green-950">
            This estimate is linked to a work order.
          </h2>

          <p className="mt-2 text-sm font-bold text-green-800">
            Converted{" "}
            {formatDateTime(estimate.converted_at)}.
            Duplicate conversion is blocked.
          </p>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
              Client Submission
            </p>
            <h2 className="mt-1 text-xl font-black">
              Client Submitted Photos
            </h2>
          </div>

          <span className="rounded-full bg-gray-100 px-3 py-2 text-xs font-black uppercase text-gray-700">
            {requestPhotos.length} Photo{requestPhotos.length === 1 ? "" : "s"}
          </span>
        </div>

        {requestPhotos.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
            No client-submitted photos are attached to this request.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {requestPhotos.map((photo) =>
              photo.signed_url ? (
                <a
                  key={photo.id}
                  href={photo.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border bg-gray-50"
                >
                  <img
                    src={photo.signed_url}
                    alt={photo.caption || "Client submitted request photo"}
                    className="h-40 w-full object-cover sm:h-48"
                  />
                </a>
              ) : (
                <div
                  key={photo.id}
                  className="rounded-2xl border bg-gray-50 p-4 text-sm font-black"
                >
                  Photo unavailable
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Customer">
              <select
                value={form.clientId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    clientId: event.target.value,
                  }))
                }
                disabled={isConverted}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
              >
                <option value="">No customer selected</option>

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
                disabled={isConverted}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
              >
                <option value="">No property selected</option>

                {properties.map((property) => (
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
                disabled={isConverted}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
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

            <Field label="Estimate Status">
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                disabled={isConverted}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="md:col-span-2">
              <Field label="Estimate Title">
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  disabled={isConverted}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Scope of Work">
                <textarea
                  value={form.scope}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scope: event.target.value,
                    }))
                  }
                  rows={10}
                  disabled={isConverted}
                  className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
                />
              </Field>
            </div>

            <Field label="Estimate Total">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.total}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    total: event.target.value,
                  }))
                }
                disabled={isConverted}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
              />
            </Field>
          </div>

          {!isConverted && (
            <div className="mt-7 flex flex-wrap justify-end gap-3">
              {form.status !== "approved" && (
                <button
                  type="button"
                  onClick={() => void markApproved()}
                  disabled={isSaving}
                  className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  Mark Approved
                </button>
              )}

              <button
                type="button"
                onClick={() => void saveEstimate()}
                disabled={isSaving}
                className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Estimate Summary
            </p>

            <dl className="mt-5 space-y-4">
              <SummaryItem
                label="Status"
                value={formatStatus(form.status)}
              />

              <SummaryItem
                label="Customer"
                value={
                  selectedClient?.client_name ||
                  "Not selected"
                }
              />

              <SummaryItem
                label="Property"
                value={
                  selectedProperty
                    ? formatProperty(selectedProperty)
                    : "Not selected"
                }
              />

              <SummaryItem
                label="Service"
                value={
                  selectedService?.service_name ||
                  "Not selected"
                }
              />

              <SummaryItem
                label="Total"
                value={
                  form.total
                    ? formatCurrency(Number(form.total))
                    : "$0.00"
                }
              />

              <SummaryItem
                label="Approved"
                value={formatDateTime(
                  estimate.approved_at,
                )}
              />

              <SummaryItem
                label="Created"
                value={formatDateTime(
                  estimate.created_at,
                )}
              />

              <SummaryItem
                label="Updated"
                value={formatDateTime(
                  estimate.updated_at,
                )}
              />
            </dl>
          </section>

          {(form.status === "approved" || form.status === "declined") &&
            Boolean(estimate.client_response_at) && (
              <section
                className={
                  form.status === "approved"
                    ? "rounded-2xl border border-green-200 bg-green-50 p-6"
                    : "rounded-2xl border border-red-200 bg-red-50 p-6"
                }
              >
                <p
                  className={
                    form.status === "approved"
                      ? "text-xs font-black uppercase tracking-wide text-green-700"
                      : "text-xs font-black uppercase tracking-wide text-red-700"
                  }
                >
                  Client Response
                </p>

                <h2
                  className={
                    form.status === "approved"
                      ? "mt-2 text-xl font-black text-green-950"
                      : "mt-2 text-xl font-black text-red-950"
                  }
                >
                  {form.status === "approved"
                    ? "CLIENT APPROVED"
                    : "CLIENT DECLINED"}
                </h2>

                <p className="mt-2 text-sm font-bold text-gray-700">
                  Responded {formatDateTime(estimate.client_response_at)}
                </p>

                {stringValue(estimate.client_response_note) && (
                  <div className="mt-4 rounded-xl bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                      Client Note
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-gray-800">
                      {stringValue(estimate.client_response_note)}
                    </p>
                  </div>
                )}
              </section>
            )}

          {!isConverted && (
            <section className="rounded-2xl border border-pink-200 bg-pink-50 p-6">
              <p className="text-sm font-black text-pink-950">
                Ready for Work-Order Conversion
              </p>

              <p className="mt-2 text-sm font-bold leading-6 text-pink-800">
                Confirm the estimate is approved and that
                customer, scope, and pricing are accurate
                before conversion.
              </p>

              <Link
                href={`/admin/estimates/${estimateId}/convert`}
                className="mt-5 inline-block rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white"
              >
                Convert to Work Order
              </Link>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-black text-gray-800">
        {label}
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

      <dd className="mt-1 break-words font-black text-gray-950">
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

function firstNumber(
  estimate: GenericEstimate,
  keys: string[],
) {
  for (const key of keys) {
    const value = estimate[key];
    const numericValue = Number(value);

    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(numericValue)
    ) {
      return numericValue;
    }
  }

  return null;
}

function formatNumericInput(
  value: unknown,
) {
  const numericValue = Number(value);

  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(numericValue)
  ) {
    return "";
  }

  return numericValue.toFixed(2);
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

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDateTime(value: unknown) {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}