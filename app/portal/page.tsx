"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type PortalMapping = {
  id: string;
  client_id: string;
  profile_id: string;
  portal_role: string;
  is_active: boolean;
};

type Client = {
  id: string;
  client_name: string;
  client_type: string | null;
  primary_email: string | null;
  primary_phone: string | null;
};

type Property = {
  id: string;
  client_id: string | null;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  property_type: string | null;
  active: boolean | null;
};


type Service = {
  id: string;
  service_name: string;
  service_category: string | null;
  description: string | null;
  active: boolean | null;
};

type ServiceRequest = {
  id: string;
  client_id: string | null;
  property_id: string | null;
  service_id: string | null;
  request_title: string | null;
  request_description: string | null;
  requested_service_type: string | null;
  preferred_timing: string | null;
  status: string | null;
  client_visible_notes: string | null;
  estimate_status: string | null;
  estimate_title: string | null;
  scope_of_work: string | null;
  estimated_total: number | string | null;
  approved_at: string | null;
  client_response_at: string | null;
  client_response_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  converted_job_id: string | null;
  converted_at: string | null;
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

type Job = {
  id: string;
  client_id: string | null;
  property_id: string | null;
  job_title: string;
  job_description: string | null;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  client_visible_notes: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  final_price: number | null;
};

type JobPhoto = {
  id: string;
  job_id: string;
  photo_url: string;
  photo_type: string | null;
  caption: string | null;
  client_visible: boolean | null;
  created_at: string | null;
  signed_url?: string;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  property_id: string | null;
  invoice_status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  customer_notes: string | null;
  payment_terms: string | null;
  paid_at: string | null;
  created_at: string | null;
};

export default function PortalPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  const [profileName, setProfileName] = useState("");
  const [portalRole, setPortalRole] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [requestPhotos, setRequestPhotos] = useState<RequestPhoto[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [requestPropertyId, setRequestPropertyId] = useState("");
  const [requestServiceId, setRequestServiceId] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestTiming, setRequestTiming] = useState("");
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [respondingEstimateId, setRespondingEstimateId] = useState("");
  const [estimateResponseNote, setEstimateResponseNote] =
    useState<Record<string, string>>({});
  const [estimateResponseMessage, setEstimateResponseMessage] =
    useState<Record<string, string>>({});

  const loadPortal = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setErrorMessage(profileError.message);
      setIsLoading(false);
      return;
    }

    if (!profile || profile.role !== "client") {
      setErrorMessage(
        "This account is not configured for client portal access.",
      );
      setIsLoading(false);
      return;
    }

    setProfileName(profile.full_name || profile.email || "Client");

    const { data: mappingsData, error: mappingsError } = await supabase
      .from("client_portal_users")
      .select("id, client_id, profile_id, portal_role, is_active")
      .eq("profile_id", user.id)
      .eq("is_active", true);

    if (mappingsError) {
      setErrorMessage(mappingsError.message);
      setIsLoading(false);
      return;
    }

    const mappings = (mappingsData ?? []) as PortalMapping[];
    const clientIds = mappings.map((mapping) => mapping.client_id);

    setPortalRole(mappings[0]?.portal_role ?? "viewer");

    if (clientIds.length === 0) {
      setClients([]);
      setProperties([]);
      setServices([]);
      setServiceRequests([]);
      setRequestPhotos([]);
      setJobs([]);
      setPhotos([]);
      setInvoices([]);
      setIsLoading(false);
      return;
    }

    const [
      clientsResponse,
      propertiesResponse,
      servicesResponse,
      requestsResponse,
      jobsResponse,
      invoicesResponse,
    ] = await Promise.all([
      supabase
        .from("clients")
        .select(`
          id,
          client_name,
          client_type,
          primary_email,
          primary_phone
        `)
        .in("id", clientIds)
        .order("client_name"),

      supabase
        .from("properties")
        .select(`
          id,
          client_id,
          property_name,
          street_address,
          city,
          state,
          zip_code,
          property_type,
          active
        `)
        .in("client_id", clientIds)
        .order("property_name"),

      supabase
        .from("services")
        .select("id, service_name, service_category, description, active")
        .eq("active", true)
        .order("service_name"),

      supabase
        .from("estimate_requests")
        .select(
          "id, client_id, property_id, service_id, request_title, request_description, requested_service_type, preferred_timing, status, client_visible_notes, estimate_status, estimate_title, scope_of_work, estimated_total, approved_at, client_response_at, client_response_note, created_at, updated_at, converted_job_id, converted_at",
        )
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(25),

      supabase
        .from("jobs")
        .select(`
          id,
          client_id,
          property_id,
          job_title,
          job_description,
          job_status,
          priority,
          scheduled_start,
          scheduled_end,
          client_visible_notes,
          completion_notes,
          completed_at,
          final_price
        `)
        .in("client_id", clientIds)
        .order("scheduled_start", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(50),

      supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          client_id,
          property_id,
          invoice_status,
          issue_date,
          due_date,
          total_amount,
          amount_paid,
          balance_due,
          customer_notes,
          payment_terms,
          paid_at,
          created_at
        `)
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const firstError =
      clientsResponse.error ||
      propertiesResponse.error ||
      servicesResponse.error ||
      requestsResponse.error ||
      jobsResponse.error ||
      invoicesResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedProperties = (propertiesResponse.data ?? []) as Property[];
    const loadedRequests = (requestsResponse.data ?? []) as ServiceRequest[];
    const loadedJobs = (jobsResponse.data ?? []) as Job[];
    const requestIds = loadedRequests.map((request) => request.id);
    const jobIds = loadedJobs.map((job) => job.id);

    let loadedRequestPhotos: RequestPhoto[] = [];

    if (requestIds.length > 0) {
      const { data: requestPhotosData, error: requestPhotosError } = await supabase
        .from("estimate_request_photos")
        .select("id, request_id, storage_path, caption, uploaded_by, created_at")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false });

      if (requestPhotosError) {
        setErrorMessage(requestPhotosError.message);
        setIsLoading(false);
        return;
      }

      loadedRequestPhotos = await Promise.all(
        ((requestPhotosData ?? []) as RequestPhoto[]).map(async (photo) => {
          const { data, error } = await supabase.storage
            .from("request-photos")
            .createSignedUrl(photo.storage_path, 60 * 60);

          if (error || !data?.signedUrl) return photo;

          return { ...photo, signed_url: data.signedUrl };
        }),
      );
    }

    let loadedPhotos: JobPhoto[] = [];

    if (jobIds.length > 0) {
      const { data: photosData, error: photosError } = await supabase
        .from("job_photos")
        .select(`
          id,
          job_id,
          photo_url,
          photo_type,
          caption,
          client_visible,
          created_at
        `)
        .in("job_id", jobIds)
        .eq("client_visible", true)
        .order("created_at", { ascending: false });

      if (photosError) {
        setErrorMessage(photosError.message);
        setIsLoading(false);
        return;
      }

      loadedPhotos = await Promise.all(
        ((photosData ?? []) as JobPhoto[]).map(async (photo) => {
          const { data, error } = await supabase.storage
            .from("job-photos")
            .createSignedUrl(photo.photo_url, 60 * 60);

          if (error || !data?.signedUrl) {
            return photo;
          }

          return {
            ...photo,
            signed_url: data.signedUrl,
          };
        }),
      );
    }

    setClients((clientsResponse.data ?? []) as Client[]);
    setProperties(loadedProperties);
    setServices((servicesResponse.data ?? []) as Service[]);
    setServiceRequests(loadedRequests);
    setRequestPhotos(loadedRequestPhotos);
    setJobs(loadedJobs);
    setInvoices((invoicesResponse.data ?? []) as Invoice[]);
    setPhotos(loadedPhotos);

    setRequestPropertyId((current) => {
      if (current && loadedProperties.some((property) => property.id === current)) {
        return current;
      }

      return loadedProperties.find((property) => property.active !== false)?.id ?? "";
    });

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadPortal();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [loadPortal, router]);

  const activeProperties = useMemo(
    () => properties.filter((property) => property.active !== false),
    [properties],
  );

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.job_status !== "completed" &&
          job.job_status !== "cancelled",
      ),
    [jobs],
  );

  const completedJobs = useMemo(
    () =>
      jobs
        .filter((job) => job.job_status === "completed")
        .slice(0, 10),
    [jobs],
  );

  const recentPhotos = useMemo(
    () => photos.filter((photo) => photo.signed_url).slice(0, 12),
    [photos],
  );

  const openInvoiceBalance = useMemo(
    () =>
      invoices.reduce(
        (sum, invoice) => sum + Number(invoice.balance_due ?? 0),
        0,
      ),
    [invoices],
  );

  const unpaidInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          Number(invoice.balance_due ?? 0) > 0 &&
          invoice.invoice_status !== "void",
      ),
    [invoices],
  );

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRequest) return;

    setRequestMessage("");
    setErrorMessage("");

    if (!requestPropertyId) {
      setRequestMessage("Select a property.");
      return;
    }

    if (!requestServiceId) {
      setRequestMessage("Select a service.");
      return;
    }

    if (!requestTitle.trim()) {
      setRequestMessage("Enter a request title.");
      return;
    }

    if (!requestDescription.trim()) {
      setRequestMessage("Describe what you need.");
      return;
    }

    if (requestFiles.length > 5) {
      setRequestMessage("You can attach up to 5 photos per request.");
      return;
    }

    const oversizedFile = requestFiles.find(
      (file) => file.size > 10 * 1024 * 1024,
    );

    if (oversizedFile) {
      setRequestMessage(
        `"${oversizedFile.name}" is larger than 10 MB. Choose a smaller image.`,
      );
      return;
    }

    setIsSubmittingRequest(true);

    const { data: requestId, error } = await supabase.rpc(
      "submit_portal_service_request",
      {
        p_property_id: requestPropertyId,
        p_service_id: requestServiceId,
        p_request_title: requestTitle.trim(),
        p_request_description: requestDescription.trim(),
        p_preferred_timing: requestTiming.trim() || null,
      },
    );

    if (error || !requestId) {
      setRequestMessage(error?.message || "The service request could not be created.");
      setIsSubmittingRequest(false);
      return;
    }

    let photoWarning = "";

    if (requestFiles.length > 0) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        photoWarning =
          " The request was created, but the photos could not be attached because your session expired.";
      } else {
        for (const file of requestFiles) {
          const safeName =
            file.name
              .toLowerCase()
              .replace(/[^a-z0-9._-]+/g, "-")
              .replace(/^-+|-+$/g, "") || "photo.jpg";

          const storagePath = `${requestId}/${crypto.randomUUID()}-${safeName}`;

          const { error: uploadError } = await supabase.storage
            .from("request-photos")
            .upload(storagePath, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || undefined,
            });

          if (uploadError) {
            photoWarning =
              " The request was created, but one or more photos could not be uploaded.";
            continue;
          }

          const { error: photoRowError } = await supabase
            .from("estimate_request_photos")
            .insert({
              request_id: requestId,
              storage_path: storagePath,
              uploaded_by: user.id,
            });

          if (photoRowError) {
            await supabase.storage.from("request-photos").remove([storagePath]);
            photoWarning =
              " The request was created, but one or more photos could not be attached.";
          }
        }
      }
    }

    setRequestTitle("");
    setRequestDescription("");
    setRequestTiming("");
    setRequestServiceId("");
    setRequestFiles([]);
    setRequestMessage(
      `Request submitted successfully. Bakersss has received it.${photoWarning}`,
    );

    await loadPortal();
    setIsSubmittingRequest(false);
  }

  async function handleEstimateResponse(
    requestId: string,
    decision: "approved" | "declined",
  ) {
    if (respondingEstimateId) return;

    setRespondingEstimateId(requestId);
    setEstimateResponseMessage((current) => ({
      ...current,
      [requestId]: "",
    }));

    const { data, error } = await supabase.rpc(
      "respond_to_portal_estimate",
      {
        p_request_id: requestId,
        p_decision: decision,
        p_note: estimateResponseNote[requestId]?.trim() || null,
      },
    );

    if (error) {
      setEstimateResponseMessage((current) => ({
        ...current,
        [requestId]: error.message,
      }));
      setRespondingEstimateId("");
      return;
    }

    setEstimateResponseMessage((current) => ({
      ...current,
      [requestId]:
        data === "approved"
          ? "Estimate approved successfully."
          : "Estimate declined successfully.",
    }));

    await loadPortal();
    setRespondingEstimateId("");
  }

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function propertyForJob(job: Job) {
    return properties.find((property) => property.id === job.property_id);
  }

  function propertyForInvoice(invoice: Invoice) {
    return properties.find(
      (property) => property.id === invoice.property_id,
    );
  }

  function propertyForRequest(request: ServiceRequest) {
    return properties.find((property) => property.id === request.property_id);
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <p className="font-black">Loading your client portal...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-16 sm:p-6">
      <header className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-bakerssPink">
              Bakersss Client Portal
            </p>
            <h1 className="mt-2 text-3xl font-black text-gray-950">
              Welcome, {profileName}
            </h1>
            <p className="mt-2 text-sm font-semibold text-gray-500">
              Request service and view your properties, work status, approved photos,
              completed work, and invoices.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-2 text-xs font-black uppercase text-gray-700">
              {formatStatus(portalRole)}
            </span>

            <button
              type="button"
              onClick={() => void loadPortal()}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-800"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {isSigningOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {clients.length === 0 && !errorMessage ? (
        <section className="rounded-3xl border bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-black">Portal access is active</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your login has not yet been linked to a Bakersss customer
            account. Contact the office to finish setup.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Properties"
              value={properties.length.toString()}
            />
            <SummaryCard
              label="Active Work"
              value={activeJobs.length.toString()}
            />
            <SummaryCard
              label="Open Requests"
              value={serviceRequests
                .filter(
                  (request) =>
                    request.status !== "completed" &&
                    request.status !== "closed" &&
                    request.status !== "cancelled",
                )
                .length.toString()}
            />
            <SummaryCard
              label="Balance Due"
              value={formatCurrency(openInvoiceBalance)}
              warning={openInvoiceBalance > 0}
            />
          </section>

          <section className="rounded-3xl border border-pink-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
                Client Self-Service
              </p>
              <h2 className="mt-1 text-xl font-black">Request Service</h2>
              <p className="mt-1 text-sm text-gray-500">
                Submit a new service request directly to Bakersss Property Services.
              </p>
            </div>

            <form
              onSubmit={(event) => void handleSubmitRequest(event)}
              className="mt-5 grid gap-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-black text-gray-800">Property</span>
                  <select
                    value={requestPropertyId}
                    onChange={(event) => setRequestPropertyId(event.target.value)}
                    disabled={activeProperties.length === 0}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-gray-600"
                    required
                  >
                    <option value="">Select property</option>
                    {activeProperties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.property_name || formatPropertyAddress(property)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-black text-gray-800">Service</span>
                  <select
                    value={requestServiceId}
                    onChange={(event) => setRequestServiceId(event.target.value)}
                    disabled={services.length === 0}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-gray-600"
                    required
                  >
                    <option value="">Select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.service_name}
                        {service.service_category ? ` — ${service.service_category}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-black text-gray-800">Request Title</span>
                <input
                  value={requestTitle}
                  onChange={(event) => setRequestTitle(event.target.value)}
                  placeholder="Example: Upstairs AC is not cooling"
                  maxLength={140}
                  className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold outline-none focus:border-gray-600"
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-black text-gray-800">What do you need?</span>
                <textarea
                  value={requestDescription}
                  onChange={(event) => setRequestDescription(event.target.value)}
                  placeholder="Describe the issue, where it is located, and anything our team should know."
                  rows={5}
                  className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold outline-none focus:border-gray-600"
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-black text-gray-800">Preferred Timing</span>
                <input
                  value={requestTiming}
                  onChange={(event) => setRequestTiming(event.target.value)}
                  placeholder="Example: Monday morning, ASAP, or after 2 PM"
                  maxLength={200}
                  className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold outline-none focus:border-gray-600"
                />
              </label>

              {requestMessage && (
                <div className="rounded-xl border bg-gray-50 p-3 text-sm font-bold text-gray-700">
                  {requestMessage}
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={
                    isSubmittingRequest ||
                    activeProperties.length === 0 ||
                    services.length === 0
                  }
                  className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingRequest ? "Submitting..." : "Submit Service Request"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">Requests</p>
              <h2 className="mt-1 text-xl font-black">Your Service Requests</h2>
            </div>

            {serviceRequests.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                You have not submitted any service requests yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {serviceRequests.map((request) => {
                  const property = propertyForRequest(request);
                  const convertedJob = request.converted_job_id
                    ? jobs.find((job) => job.id === request.converted_job_id)
                    : null;

                  return (
                    <article key={request.id} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span className={requestBadge(request.status)}>
                              {formatStatus(request.status || "new")}
                            </span>

                            {request.requested_service_type && (
                              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase text-gray-700">
                                {request.requested_service_type}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-lg font-black text-gray-950">
                            {request.request_title || "Service Request"}
                          </h3>

                          {property && (
                            <p className="mt-1 text-sm font-semibold text-gray-600">
                              {property.property_name || formatPropertyAddress(property)}
                            </p>
                          )}

                          {request.created_at && (
                            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                              Submitted {formatDateTime(request.created_at)}
                            </p>
                          )}

                          {request.request_description && (
                            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                              {request.request_description}
                            </p>
                          )}

                          {request.preferred_timing && (
                            <p className="mt-3 text-sm font-semibold text-gray-700">
                              Preferred timing: {request.preferred_timing}
                            </p>
                          )}

                          {request.estimate_status && (
                            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                                    Estimate
                                  </p>
                                  <p className="mt-1 text-base font-black text-gray-950">
                                    {request.estimate_title || request.request_title || "Estimate"}
                                  </p>
                                </div>

                                <span className={requestBadge(request.estimate_status)}>
                                  {formatStatus(request.estimate_status)}
                                </span>
                              </div>

                              {request.scope_of_work && (
                                <div className="mt-4 rounded-xl bg-white p-3">
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                                    Scope of Work
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                                    {request.scope_of_work}
                                  </p>
                                </div>
                              )}

                              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                                    Estimated Total
                                  </p>
                                  <p className="mt-1 text-2xl font-black text-gray-950">
                                    {formatCurrency(Number(request.estimated_total ?? 0))}
                                  </p>
                                </div>

                                {request.client_response_at && (
                                  <p className="text-xs font-bold text-gray-500">
                                    Responded {formatDateTime(request.client_response_at)}
                                  </p>
                                )}
                              </div>

                              {request.client_response_note && (
                                <div className="mt-3 rounded-xl bg-white p-3 text-sm text-gray-700">
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                                    Your Response Note
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap font-semibold">
                                    {request.client_response_note}
                                  </p>
                                </div>
                              )}

                              {request.estimate_status === "sent" && (
                                <div className="mt-4 border-t pt-4">
                                  <label className="grid gap-2">
                                    <span className="text-sm font-black text-gray-800">
                                      Response Note <span className="font-semibold text-gray-500">(optional)</span>
                                    </span>
                                    <textarea
                                      value={estimateResponseNote[request.id] || ""}
                                      onChange={(event) =>
                                        setEstimateResponseNote((current) => ({
                                          ...current,
                                          [request.id]: event.target.value,
                                        }))
                                      }
                                      rows={3}
                                      placeholder="Add any questions or comments for our team."
                                      className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-gray-600"
                                    />
                                  </label>

                                  {estimateResponseMessage[request.id] && (
                                    <div className="mt-3 rounded-xl border bg-white p-3 text-sm font-bold text-gray-700">
                                      {estimateResponseMessage[request.id]}
                                    </div>
                                  )}

                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleEstimateResponse(request.id, "approved")
                                      }
                                      disabled={Boolean(respondingEstimateId)}
                                      className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                                    >
                                      {respondingEstimateId === request.id
                                        ? "Submitting..."
                                        : "Approve Estimate"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleEstimateResponse(request.id, "declined")
                                      }
                                      disabled={Boolean(respondingEstimateId)}
                                      className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                                    >
                                      {respondingEstimateId === request.id
                                        ? "Submitting..."
                                        : "Decline Estimate"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {request.converted_job_id && (
                            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-green-700 px-3 py-1 text-xs font-black uppercase text-white">
                                  Work Order Created
                                </span>

                                {convertedJob?.job_status && (
                                  <span className={statusBadge(convertedJob.job_status)}>
                                    {formatStatus(convertedJob.job_status)}
                                  </span>
                                )}
                              </div>

                              {request.converted_at && (
                                <p className="mt-3 text-sm font-bold text-green-900">
                                  Converted {formatDateTime(request.converted_at)}
                                </p>
                              )}

                              {convertedJob?.scheduled_start ? (
                                <p className="mt-2 text-sm font-black text-green-950">
                                  Scheduled: {formatDateTime(convertedJob.scheduled_start)}
                                </p>
                              ) : (
                                <p className="mt-2 text-sm font-semibold text-green-800">
                                  Scheduling pending.
                                </p>
                              )}
                            </div>
                          )}

                          {request.client_visible_notes && (
                            <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-950">
                              <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                                Bakersss Update
                              </p>
                              <p className="mt-1 font-semibold">{request.client_visible_notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Account
              </p>
              <h2 className="mt-1 text-xl font-black">Your Properties</h2>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {properties.map((property) => (
                <article
                  key={property.id}
                  className="rounded-2xl border bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-950">
                        {property.property_name || "Property"}
                      </p>
                      <p className="mt-2 text-sm text-gray-600">
                        {formatPropertyAddress(property)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                        property.active === false
                          ? "bg-gray-200 text-gray-700"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {property.active === false ? "Inactive" : "Active"}
                    </span>
                  </div>

                  {property.property_type && (
                    <p className="mt-3 text-xs font-black uppercase tracking-wide text-gray-500">
                      {property.property_type}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Service Status
              </p>
              <h2 className="mt-1 text-xl font-black">
                Upcoming & Active Work
              </h2>
            </div>

            {activeJobs.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                No active work orders right now.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {activeJobs.map((job) => {
                  const property = propertyForJob(job);

                  return (
                    <article
                      key={job.id}
                      className="rounded-2xl border p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span className={statusBadge(job.job_status)}>
                              {formatStatus(job.job_status || "new")}
                            </span>

                            {job.priority &&
                              job.priority !== "normal" && (
                                <span className={priorityBadge(job.priority)}>
                                  {formatStatus(job.priority)}
                                </span>
                              )}
                          </div>

                          <h3 className="mt-3 text-lg font-black text-gray-950">
                            {job.job_title}
                          </h3>

                          {property && (
                            <p className="mt-1 text-sm font-semibold text-gray-600">
                              {property.property_name ||
                                formatPropertyAddress(property)}
                            </p>
                          )}

                          <p className="mt-2 text-sm font-bold text-gray-700">
                            {job.scheduled_start
                              ? formatDateTime(job.scheduled_start)
                              : "Scheduling pending"}
                          </p>

                          {job.client_visible_notes && (
                            <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-950">
                              <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                                Service Update
                              </p>
                              <p className="mt-1 font-semibold">
                                {job.client_visible_notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Service Records
              </p>
              <h2 className="mt-1 text-xl font-black">Recent Completed Work</h2>
            </div>

            {completedJobs.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                No completed work orders are available yet.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {completedJobs.map((job) => {
                  const property = propertyForJob(job);

                  return (
                    <article
                      key={job.id}
                      className="rounded-2xl border bg-gray-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-gray-950">
                            {job.job_title}
                          </p>
                          {property && (
                            <p className="mt-1 text-sm font-semibold text-gray-600">
                              {property.property_name ||
                                formatPropertyAddress(property)}
                            </p>
                          )}
                        </div>

                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase text-green-800">
                          Completed
                        </span>
                      </div>

                      <p className="mt-3 text-sm font-bold text-gray-700">
                        {job.completed_at
                          ? formatDateTime(job.completed_at)
                          : "Completed"}
                      </p>

                      {(job.completion_notes ||
                        job.client_visible_notes) && (
                        <div className="mt-3 rounded-xl bg-white p-3 text-sm text-gray-700">
                          {job.completion_notes ||
                            job.client_visible_notes}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Photo Documentation
              </p>
              <h2 className="mt-1 text-xl font-black">
                Client-Visible Job Photos
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Only photos approved for client viewing appear here.
              </p>
            </div>

            {recentPhotos.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                No client-visible photos are available yet.
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {recentPhotos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-2xl border bg-gray-50"
                  >
                    <img
                      src={photo.signed_url}
                      alt={photo.caption || "Service photo"}
                      className="h-40 w-full object-cover sm:h-48"
                    />
                    <div className="p-3">
                      <p className="text-xs font-black uppercase text-gray-500">
                        {formatStatus(photo.photo_type || "photo")}
                      </p>
                      {photo.caption && (
                        <p className="mt-1 text-sm font-semibold text-gray-700">
                          {photo.caption}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Billing
                </p>
                <h2 className="mt-1 text-xl font-black">Invoices</h2>
              </div>

              <p className="text-sm font-black text-gray-700">
                {unpaidInvoices.length} open invoice
                {unpaidInvoices.length === 1 ? "" : "s"}
              </p>
            </div>

            {invoices.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                No invoices are available.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs font-black uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-3">Invoice</th>
                      <th className="px-3 py-3">Property</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Due</th>
                      <th className="px-3 py-3 text-right">Total</th>
                      <th className="px-3 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => {
                      const property = propertyForInvoice(invoice);

                      return (
                        <tr
                          key={invoice.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-3 py-4 font-black text-gray-950">
                            {invoice.invoice_number || "Invoice"}
                          </td>
                          <td className="px-3 py-4 text-gray-600">
                            {property?.property_name ||
                              (property
                                ? formatPropertyAddress(property)
                                : "—")}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={invoiceBadge(
                                invoice.invoice_status,
                                Number(invoice.balance_due ?? 0),
                              )}
                            >
                              {formatStatus(
                                invoice.invoice_status ||
                                  (Number(invoice.balance_due ?? 0) <= 0
                                    ? "paid"
                                    : "open"),
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-gray-600">
                            {invoice.due_date
                              ? formatDate(invoice.due_date)
                              : "—"}
                          </td>
                          <td className="px-3 py-4 text-right font-bold text-gray-700">
                            {formatCurrency(
                              Number(invoice.total_amount ?? 0),
                            )}
                          </td>
                          <td className="px-3 py-4 text-right font-black text-gray-950">
                            {formatCurrency(
                              Number(invoice.balance_due ?? 0),
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        warning ? "border-amber-200 bg-amber-50" : "bg-white"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-gray-950">{value}</p>
    </div>
  );
}

function formatPropertyAddress(property: Property) {
  return [
    property.street_address,
    property.city,
    property.state,
    property.zip_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function requestBadge(status: string | null) {
  switch (status) {
    case "approved":
    case "converted":
      return "rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase text-green-800";
    case "declined":
    case "cancelled":
      return "rounded-full bg-gray-200 px-3 py-1 text-xs font-black uppercase text-gray-700";
    case "in_review":
    case "reviewing":
      return "rounded-full bg-blue-100 px-3 py-1 text-xs font-black uppercase text-blue-800";
    default:
      return "rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900";
  }
}

function statusBadge(status: string | null) {
  switch (status) {
    case "in_progress":
      return "rounded-full bg-blue-100 px-3 py-1 text-xs font-black uppercase text-blue-800";
    case "completion_requested":
      return "rounded-full bg-purple-100 px-3 py-1 text-xs font-black uppercase text-purple-800";
    case "completed":
      return "rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase text-green-800";
    case "cancelled":
      return "rounded-full bg-gray-200 px-3 py-1 text-xs font-black uppercase text-gray-700";
    default:
      return "rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900";
  }
}

function priorityBadge(priority: string) {
  if (priority === "urgent") {
    return "rounded-full bg-red-700 px-3 py-1 text-xs font-black uppercase text-white";
  }

  if (priority === "high") {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase text-red-800";
  }

  return "rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase text-gray-700";
}

function invoiceBadge(status: string | null, balanceDue: number) {
  if (balanceDue <= 0 || status === "paid") {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase text-green-800";
  }

  if (status === "overdue") {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase text-red-800";
  }

  return "rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900";
}