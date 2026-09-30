"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

type PropertyOption = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

type ServiceOption = {
  id: string;
  service_name: string;
  default_duration_minutes: number | null;
};

type FieldOptions = {
  properties: PropertyOption[];
  services: ServiceOption[];
};

export default function TechnicianCreateWorkOrderPage() {
  const router = useRouter();
  const [options, setOptions] = useState<FieldOptions>({ properties: [], services: [] });
  const [propertyId, setPropertyId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignToMe, setAssignToMe] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase.rpc("get_field_work_order_options");

      if (error) {
        setErrorMessage(
          `Field work-order options could not be loaded: ${error.message}. Make sure the field-work-order Supabase migration has been run.`,
        );
        setIsLoading(false);
        return;
      }

      const payload = (data ?? {}) as Partial<FieldOptions>;
      setOptions({
        properties: Array.isArray(payload.properties) ? payload.properties : [],
        services: Array.isArray(payload.services) ? payload.services : [],
      });
      setIsLoading(false);
    }

    void loadOptions();
  }, []);

  const selectedProperty = useMemo(
    () => options.properties.find((property) => property.id === propertyId) ?? null,
    [options.properties, propertyId],
  );

  function formatProperty(property: PropertyOption) {
    const name = property.property_name || property.street_address || "Unnamed property";
    const client = property.client_name ? ` — ${property.client_name}` : "";
    const location = [property.city, property.state].filter(Boolean).join(", ");
    return `${name}${client}${location ? ` (${location})` : ""}`;
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!propertyId) {
      setErrorMessage("Select the property where the issue was found.");
      return;
    }

    if (!jobTitle.trim()) {
      setErrorMessage("Enter a short work-order title.");
      return;
    }

    setIsSubmitting(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setErrorMessage("Your login session expired. Sign in again and retry.");
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase.rpc("field_create_work_order", {
      p_property_id: propertyId,
      p_service_id: serviceId || null,
      p_job_title: jobTitle.trim(),
      p_location_detail: locationDetail.trim() || null,
      p_description: description.trim() || null,
      p_priority: priority,
      p_assign_to_me: assignToMe,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    const jobId = String(data ?? "");

    if (!jobId) {
      setErrorMessage("The work order was not created. No work-order ID was returned.");
      setIsSubmitting(false);
      return;
    }


    router.push(`/technician/jobs/${jobId}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 sm:pb-10">
      <header className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-bakerssPink">
          Field Operations
        </p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">Create Work Order</h1>
        <p className="mt-2 text-sm text-gray-600">
          Document work discovered on site. Billing, pricing, and invoicing remain admin-only.
        </p>
        <Link
          href="/technician"
          className="mt-4 inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-800"
        >
          ← Back to Technician Home
        </Link>
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

      {isLoading ? (
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="font-black">Loading properties and services...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <div>
            <label htmlFor="propertyId" className="mb-2 block text-sm font-black">
              Property <span className="text-red-600">*</span>
            </label>
            <select
              id="propertyId"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              required
            >
              <option value="">Select property</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {formatProperty(property)}
                </option>
              ))}
            </select>
            {selectedProperty?.street_address && (
              <p className="mt-2 text-xs font-bold text-gray-500">
                {[selectedProperty.street_address, selectedProperty.city, selectedProperty.state, selectedProperty.zip_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="serviceId" className="mb-2 block text-sm font-black">Service</label>
              <select
                id="serviceId"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="">General / Not sure</option>
                {options.services.map((service) => (
                  <option key={service.id} value={service.id}>{service.service_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="priority" className="mb-2 block text-sm font-black">Priority</label>
              <select
                id="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Emergency / Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="jobTitle" className="mb-2 block text-sm font-black">
              Work Order Title <span className="text-red-600">*</span>
            </label>
            <input
              id="jobTitle"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder="Example: Leak under kitchen sink"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
              required
            />
          </div>

          <div>
            <label htmlFor="locationDetail" className="mb-2 block text-sm font-black">Unit / Exact Location</label>
            <input
              id="locationDetail"
              value={locationDetail}
              onChange={(event) => setLocationDetail(event.target.value)}
              placeholder="Example: Unit 324, kitchen sink"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-black">What did you find?</label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              placeholder="Describe the issue, what you observed, and anything the office should know."
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>


          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <input
              type="checkbox"
              checked={assignToMe}
              onChange={(event) => setAssignToMe(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-black">Assign this work order to me</span>
              <span className="mt-1 block text-xs text-gray-600">
                Leave checked if you are going to handle the work. Uncheck it if the office should dispatch someone else.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-pink-100 bg-pink-50 p-4 text-sm text-gray-700">
            <p className="font-black text-gray-900">Field-created work order</p>
            <p className="mt-1">
              Bakerss OS will automatically record who created this work order and when it was created. Technicians cannot set pricing or invoice amounts from this screen.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-bakerssPink px-5 py-4 text-base font-black text-white transition disabled:opacity-60"
          >
            {isSubmitting ? "Creating Work Order..." : "Create Work Order"}
          </button>
        </form>
      )}
    </div>
  );
}
