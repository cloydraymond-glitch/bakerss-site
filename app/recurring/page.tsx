"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type RecurringService = {
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
  created_at: string | null;

  clients: {
    client_name: string;
  } | null;

  properties: {
    property_name: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
  } | null;

  services: {
    service_name: string;
  } | null;
};

type RecurringOccurrence = {
  id: string;
  recurring_service_id: string;
  job_id: string | null;
  scheduled_date: string;
  scheduled_start: string | null;
  occurrence_status: string;
  notes: string | null;
  created_at: string;
};

type FilterType = "all" | "active" | "inactive" | "attention";

export default function RecurringServicesPage() {
  const [recurringServices, setRecurringServices] = useState<
    RecurringService[]
  >([]);

  const [occurrences, setOccurrences] = useState<
    RecurringOccurrence[]
  >([]);

  const [filter, setFilter] = useState<FilterType>("active");
  const [searchText, setSearchText] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [generatingId, setGeneratingId] = useState<string | null>(
    null,
  );

  const [creatingJobId, setCreatingJobId] = useState<
    string | null
  >(null);

  const [isCreatingBulkJobs, setIsCreatingBulkJobs] =
    useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPage = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const today = getTodayInput();
      const thirtyDaysAgo = addDaysToDateInput(-30);

      const [servicesResponse, occurrencesResponse] =
        await Promise.all([
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
              client_visible_notes,
              created_at,
              clients (
                client_name
              ),
              properties (
                property_name,
                street_address,
                city,
                state
              ),
              services (
                service_name
              )
            `)
            .order("active", { ascending: false })
            .order("service_name", { ascending: true }),

          supabase
            .from("recurring_service_occurrences")
            .select(`
              id,
              recurring_service_id,
              job_id,
              scheduled_date,
              scheduled_start,
              occurrence_status,
              notes,
              created_at
            `)
            .gte("scheduled_date", thirtyDaysAgo)
            .order("scheduled_date", { ascending: true })
            .limit(500),
        ]);

      const firstError =
        servicesResponse.error || occurrencesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setRecurringServices(
        (servicesResponse.data ??
          []) as unknown as RecurringService[],
      );

      setOccurrences(
        (occurrencesResponse.data ??
          []) as RecurringOccurrence[],
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const filteredServices = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return recurringServices.filter((service) => {
      const isActive = service.active !== false;

      if (filter === "active" && !isActive) {
        return false;
      }

      if (filter === "inactive" && isActive) {
        return false;
      }

      if (filter === "attention") {
        const today = getTodayInput();
        const serviceOccurrences = occurrences.filter(
          (occurrence) =>
            occurrence.recurring_service_id === service.id,
        );

        const needsAttention = serviceOccurrences.some(
          (occurrence) =>
            occurrence.scheduled_date < today &&
            !occurrence.job_id &&
            occurrence.occurrence_status !== "cancelled" &&
            occurrence.occurrence_status !== "skipped" &&
            occurrence.occurrence_status !== "completed",
        );

        if (!needsAttention) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableValues = [
        service.service_name,
        service.services?.service_name,
        service.clients?.client_name,
        service.properties?.property_name,
        service.properties?.street_address,
        service.frequency,
        service.preferred_day,
      ];

      return searchableValues.some((value) =>
        value?.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [filter, occurrences, recurringServices, searchText]);

  const dashboardData = useMemo(() => {
    const today = getTodayInput();
    const fourteenDaysFromToday = addDaysToDateInput(14);

    const activeServices = recurringServices.filter(
      (service) => service.active !== false,
    );

    const validOccurrences = occurrences.filter(
      (occurrence) =>
        occurrence.occurrence_status !== "cancelled" &&
        occurrence.occurrence_status !== "skipped",
    );

    const upcomingOccurrences = validOccurrences.filter(
      (occurrence) => occurrence.scheduled_date >= today,
    );

    const overdueOccurrences = validOccurrences.filter(
      (occurrence) =>
        occurrence.scheduled_date < today &&
        !occurrence.job_id &&
        occurrence.occurrence_status !== "completed",
    );

    const unlinkedNext14Days = validOccurrences.filter(
      (occurrence) =>
        occurrence.scheduled_date >= today &&
        occurrence.scheduled_date <= fourteenDaysFromToday &&
        !occurrence.job_id,
    );

    const linkedJobs = validOccurrences.filter((occurrence) =>
      Boolean(occurrence.job_id),
    );

    const monthlyRecurringRevenue = activeServices.reduce(
      (sum, service) => {
        if (service.monthly_price !== null) {
          return sum + Number(service.monthly_price);
        }

        return sum;
      },
      0,
    );

    return {
      activeCount: activeServices.length,
      upcomingCount: upcomingOccurrences.length,
      overdueCount: overdueOccurrences.length,
      unlinkedNext14DaysCount: unlinkedNext14Days.length,
      linkedJobCount: linkedJobs.length,
      monthlyRecurringRevenue,
    };
  }, [occurrences, recurringServices]);

  async function generateOccurrences(
    service: RecurringService,
  ) {
    if (generatingId || creatingJobId || isCreatingBulkJobs) {
      return;
    }

    setGeneratingId(service.id);
    setErrorMessage("");
    setSuccessMessage("");

    const throughDate = addDaysToDateInput(90);

    const { data, error } = await supabase.rpc(
      "generate_recurring_service_occurrences",
      {
        p_recurring_service_id: service.id,
        p_through_date: throughDate,
      },
    );

    if (error) {
      setErrorMessage(error.message);
      setGeneratingId(null);
      return;
    }

    const createdCount =
      typeof data === "number" ? data : Number(data ?? 0);

    setSuccessMessage(
      createdCount === 1
        ? `1 upcoming visit was generated for ${service.service_name}.`
        : `${createdCount} upcoming visits were generated for ${service.service_name}.`,
    );

    setGeneratingId(null);
    await loadPage(true);
  }

  async function generateAllActiveServices() {
    if (generatingId || creatingJobId || isCreatingBulkJobs) {
      return;
    }

    const activeServices = recurringServices.filter(
      (service) => service.active !== false,
    );

    if (activeServices.length === 0) {
      setErrorMessage(
        "There are no active recurring services to generate.",
      );
      return;
    }

    setGeneratingId("all");
    setErrorMessage("");
    setSuccessMessage("");

    const throughDate = addDaysToDateInput(90);
    let totalCreated = 0;

    for (const service of activeServices) {
      const { data, error } = await supabase.rpc(
        "generate_recurring_service_occurrences",
        {
          p_recurring_service_id: service.id,
          p_through_date: throughDate,
        },
      );

      if (error) {
        setErrorMessage(
          `${service.service_name}: ${error.message}`,
        );
        setGeneratingId(null);
        return;
      }

      totalCreated +=
        typeof data === "number" ? data : Number(data ?? 0);
    }

    setSuccessMessage(
      totalCreated === 1
        ? "1 new upcoming visit was generated."
        : `${totalCreated} new upcoming visits were generated.`,
    );

    setGeneratingId(null);
    await loadPage(true);
  }

  async function toggleActive(service: RecurringService) {
    if (generatingId || creatingJobId || isCreatingBulkJobs) {
      return;
    }

    const nextActive = service.active === false;

    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("recurring_services")
      .update({
        active: nextActive,
      })
      .eq("id", service.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage(
      nextActive
        ? `${service.service_name} is now active.`
        : `${service.service_name} has been paused.`,
    );

    await loadPage(true);
  }

  async function createJobFromOccurrence(
    occurrence: RecurringOccurrence,
  ) {
    if (
      creatingJobId ||
      generatingId ||
      isCreatingBulkJobs ||
      occurrence.job_id
    ) {
      return;
    }

    setCreatingJobId(occurrence.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc(
      "create_job_from_recurring_occurrence",
      {
        p_occurrence_id: occurrence.id,
      },
    );

    if (error) {
      setErrorMessage(error.message);
      setCreatingJobId(null);
      return;
    }

    setSuccessMessage(
      `Work order created successfully. Job ID: ${String(data)}`,
    );

    setCreatingJobId(null);
    await loadPage(true);
  }

  async function createJobsForNext14Days() {
    if (
      creatingJobId ||
      generatingId ||
      isCreatingBulkJobs
    ) {
      return;
    }

    const today = getTodayInput();
    const throughDate = addDaysToDateInput(14);

    const eligibleOccurrences = occurrences.filter(
      (occurrence) =>
        occurrence.scheduled_date >= today &&
        occurrence.scheduled_date <= throughDate &&
        !occurrence.job_id &&
        occurrence.occurrence_status !== "cancelled" &&
        occurrence.occurrence_status !== "skipped" &&
        occurrence.occurrence_status !== "completed",
    );

    if (eligibleOccurrences.length === 0) {
      setErrorMessage(
        "There are no unlinked recurring visits in the next 14 days.",
      );
      setSuccessMessage("");
      return;
    }

    const confirmed = window.confirm(
      `Create ${eligibleOccurrences.length} work order${
        eligibleOccurrences.length === 1 ? "" : "s"
      } for recurring visits scheduled through ${formatDate(
        throughDate,
      )}?`,
    );

    if (!confirmed) {
      return;
    }

    setIsCreatingBulkJobs(true);
    setErrorMessage("");
    setSuccessMessage("");

    let createdCount = 0;

    for (const occurrence of eligibleOccurrences) {
      const { error } = await supabase.rpc(
        "create_job_from_recurring_occurrence",
        {
          p_occurrence_id: occurrence.id,
        },
      );

      if (error) {
        setErrorMessage(
          `Created ${createdCount} work order${
            createdCount === 1 ? "" : "s"
          } before stopping. ${error.message}`,
        );
        setIsCreatingBulkJobs(false);
        await loadPage(true);
        return;
      }

      createdCount += 1;
    }

    setSuccessMessage(
      `${createdCount} recurring work order${
        createdCount === 1 ? "" : "s"
      } created for the next 14 days.`,
    );

    setIsCreatingBulkJobs(false);
    await loadPage(true);
  }

  async function createNextJob(service: RecurringService) {
    if (creatingJobId || generatingId || isCreatingBulkJobs) {
      return;
    }

    const nextOccurrence = getOccurrencesForService(service.id).find(
      (occurrence) =>
        !occurrence.job_id &&
        occurrence.occurrence_status !== "cancelled" &&
        occurrence.occurrence_status !== "skipped",
    );

    if (!nextOccurrence) {
      setErrorMessage(
        `${service.service_name} has no unlinked upcoming visits.`,
      );
      setSuccessMessage("");
      return;
    }

    await createJobFromOccurrence(nextOccurrence);
  }

  function getOccurrencesForService(serviceId: string) {
    return occurrences.filter(
      (occurrence) =>
        occurrence.recurring_service_id === serviceId,
    );
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-3xl font-black">
            Recurring Services
          </h1>

          <p className="mt-2 text-gray-600">
            Loading recurring schedules…
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
            Recurring Services
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Manage repeating service agreements and generate
            upcoming visits for weekly, biweekly, monthly, and
            seasonal work.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadPage(true)}
            disabled={
              isRefreshing ||
              Boolean(generatingId) ||
              Boolean(creatingJobId) ||
              isCreatingBulkJobs
            }
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() =>
              void createJobsForNext14Days()
            }
            disabled={
              Boolean(generatingId) ||
              Boolean(creatingJobId) ||
              isCreatingBulkJobs
            }
            className="rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingBulkJobs
              ? "Creating Work Orders…"
              : `Create Jobs · Next 14 Days (${dashboardData.unlinkedNext14DaysCount})`}
          </button>

          <button
            type="button"
            onClick={() =>
              void generateAllActiveServices()
            }
            disabled={
              Boolean(generatingId) ||
              Boolean(creatingJobId) ||
              isCreatingBulkJobs
            }
            className="rounded-xl bg-black px-4 py-3 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generatingId === "all"
              ? "Generating…"
              : "Generate Next 90 Days"}
          </button>

          <Link
            href="/recurring/new"
            className="rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-pink-700"
          >
            Add Recurring Service
          </Link>
        </div>
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Active Services"
          value={dashboardData.activeCount.toString()}
        />

        <SummaryCard
          label="Upcoming Visits"
          value={dashboardData.upcomingCount.toString()}
        />

        <SummaryCard
          label="Overdue Unlinked"
          value={dashboardData.overdueCount.toString()}
          warning={dashboardData.overdueCount > 0}
        />

        <SummaryCard
          label="Visits Linked to Jobs"
          value={dashboardData.linkedJobCount.toString()}
        />

        <SummaryCard
          label="Monthly Recurring"
          value={formatCurrency(
            dashboardData.monthlyRecurringRevenue,
          )}
        />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="Active"
              selected={filter === "active"}
              onClick={() => setFilter("active")}
            />

            <FilterButton
              label="Inactive"
              selected={filter === "inactive"}
              onClick={() => setFilter("inactive")}
            />

            <FilterButton
              label={`Needs Attention (${dashboardData.overdueCount})`}
              selected={filter === "attention"}
              onClick={() => setFilter("attention")}
            />

            <FilterButton
              label="All"
              selected={filter === "all"}
              onClick={() => setFilter("all")}
            />
          </div>

          <input
            type="search"
            value={searchText}
            onChange={(event) =>
              setSearchText(event.target.value)
            }
            placeholder="Search client, property, or service"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100 lg:max-w-md"
          />
        </div>
      </section>

      {filteredServices.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <h2 className="text-xl font-black text-gray-900">
            No recurring services found
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            Add the first recurring service or change the current
            filter.
          </p>

          <Link
            href="/recurring/new"
            className="mt-5 inline-flex rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white hover:bg-pink-700"
          >
            Add Recurring Service
          </Link>
        </section>
      ) : (
        <section className="space-y-4">
          {filteredServices.map((service) => {
            const serviceOccurrences =
              getOccurrencesForService(service.id);

            const today = getTodayInput();

            const nextOccurrence =
              serviceOccurrences.find(
                (occurrence) =>
                  occurrence.scheduled_date >= today &&
                  occurrence.occurrence_status !== "cancelled" &&
                  occurrence.occurrence_status !== "skipped",
              ) ?? null;

            const overdueOccurrences =
              serviceOccurrences.filter(
                (occurrence) =>
                  occurrence.scheduled_date < today &&
                  !occurrence.job_id &&
                  occurrence.occurrence_status !== "cancelled" &&
                  occurrence.occurrence_status !== "skipped" &&
                  occurrence.occurrence_status !== "completed",
              );

            const nextUnlinkedOccurrence =
              serviceOccurrences.find(
                (occurrence) =>
                  !occurrence.job_id &&
                  occurrence.occurrence_status !== "cancelled" &&
                  occurrence.occurrence_status !== "skipped",
              ) ?? null;

            return (
              <article
                key={service.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="grid gap-5 p-5 xl:grid-cols-[1.5fr_1fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black text-gray-950">
                        {service.service_name}
                      </h2>

                      <StatusBadge
                        active={service.active !== false}
                      />

                      {overdueOccurrences.length > 0 && (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-800">
                          {overdueOccurrences.length} overdue
                        </span>
                      )}
                    </div>

                    <p className="mt-2 font-bold text-gray-800">
                      {service.clients?.client_name ??
                        "No client assigned"}
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      {formatProperty(service)}
                    </p>

                    {service.services?.service_name && (
                      <p className="mt-1 text-sm text-gray-500">
                        Service catalog:{" "}
                        {service.services.service_name}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <DetailItem
                      label="Frequency"
                      value={formatText(service.frequency)}
                    />

                    <DetailItem
                      label="Preferred Schedule"
                      value={formatPreferredSchedule(service)}
                    />

                    <DetailItem
                      label="Start Date"
                      value={formatDate(service.start_date)}
                    />

                    <DetailItem
                      label="Next Visit"
                      value={
                        nextOccurrence
                          ? formatDate(
                              nextOccurrence.scheduled_date,
                            )
                          : "Not generated"
                      }
                    />

                    <DetailItem
                      label="Price Per Visit"
                      value={
                        service.price_per_visit === null
                          ? "—"
                          : formatCurrency(
                              Number(service.price_per_visit),
                            )
                      }
                    />

                    <DetailItem
                      label="Monthly Price"
                      value={
                        service.monthly_price === null
                          ? "—"
                          : formatCurrency(
                              Number(service.monthly_price),
                            )
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 xl:flex-col">
                    <button
                      type="button"
                      onClick={() =>
                        void createNextJob(service)
                      }
                      disabled={
                        !nextUnlinkedOccurrence ||
                        Boolean(generatingId) ||
                        Boolean(creatingJobId)
                      }
                      className="rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingJobId === nextUnlinkedOccurrence?.id
                        ? "Creating Next Job…"
                        : nextUnlinkedOccurrence
                          ? `Create Next Job · ${formatCompactDate(
                              nextUnlinkedOccurrence.scheduled_date,
                            )}`
                          : "All Visits Linked"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void generateOccurrences(service)
                      }
                      disabled={
                        Boolean(generatingId) ||
                        Boolean(creatingJobId)
                      }
                      className="rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingId === service.id
                        ? "Generating…"
                        : "Generate Visits"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void toggleActive(service)
                      }
                      disabled={
                        Boolean(generatingId) ||
                        Boolean(creatingJobId)
                      }
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {service.active === false
                        ? "Reactivate"
                        : "Pause"}
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        Recent & Upcoming Occurrences
                      </p>

                      <p className="mt-1 text-sm font-semibold text-gray-800">
                        {serviceOccurrences.length === 0
                          ? "No upcoming visits generated."
                          : `${serviceOccurrences.length} upcoming visit${
                              serviceOccurrences.length === 1
                                ? ""
                                : "s"
                            } generated.`}
                      </p>
                    </div>

                    {serviceOccurrences.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {serviceOccurrences
                          .slice(0, 8)
                          .map((occurrence) => {
                            const isOverdue =
                              occurrence.scheduled_date <
                                getTodayInput() &&
                              !occurrence.job_id &&
                              occurrence.occurrence_status !==
                                "completed";

                            return (
                            <div
                              key={occurrence.id}
                              className={`flex items-center gap-2 rounded-xl border p-2 ${
                                isOverdue
                                  ? "border-red-200 bg-red-50"
                                  : "border-gray-200 bg-white"
                              }`}
                            >
                              <span
                                className={`px-2 text-xs font-bold ${
                                  isOverdue
                                    ? "text-red-800"
                                    : "text-gray-700"
                                }`}
                              >
                                {isOverdue ? "OVERDUE · " : ""}
                                {formatCompactDate(
                                  occurrence.scheduled_date,
                                )}
                              </span>

                              {occurrence.job_id ? (
                                <Link
                                  href={`/work-orders/${occurrence.job_id}`}
                                  className="rounded-lg bg-green-100 px-3 py-2 text-xs font-black text-green-800 hover:bg-green-200"
                                >
                                  View Job
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void createJobFromOccurrence(
                                      occurrence,
                                    )
                                  }
                                  disabled={
                                    Boolean(creatingJobId) ||
                                    Boolean(generatingId)
                                  }
                                  className="rounded-lg bg-black px-3 py-2 text-xs font-black text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {creatingJobId ===
                                  occurrence.id
                                    ? "Creating…"
                                    : "Create Job"}
                                </button>
                              )}
                            </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
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
      className={`rounded-2xl border p-5 shadow-sm ${
        warning
          ? "border-red-200 bg-red-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-black ${
          warning ? "text-red-800" : "text-gray-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
        selected
          ? "bg-black text-white"
          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
        active
          ? "bg-green-100 text-green-800"
          : "bg-gray-200 text-gray-700"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 font-semibold text-gray-900">
        {value}
      </p>
    </div>
  );
}

function formatProperty(service: RecurringService) {
  const property = service.properties;

  if (!property) {
    return "No property assigned";
  }

  const propertyName =
    property.property_name?.trim() ||
    property.street_address?.trim() ||
    "Property";

  const location = [property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return location
    ? `${propertyName} · ${location}`
    : propertyName;
}

function formatPreferredSchedule(
  service: RecurringService,
) {
  const scheduleParts = [
    service.preferred_day
      ? formatText(service.preferred_day)
      : null,

    service.preferred_time
      ? formatTime(service.preferred_time)
      : null,
  ].filter(Boolean);

  return scheduleParts.length > 0
    ? scheduleParts.join(" at ")
    : "Not specified";
}

function formatText(value: string | null) {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCompactDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  const normalizedValue = value.trim();

  const match = normalizedValue.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?$/,
  );

  if (!match) {
    return normalizedValue;
  }

  const hour = Number(match[1]);
  const minute = match[2];

  if (
    Number.isNaN(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return normalizedValue;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function getTodayInput() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    now.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDateInput(days: number) {
  const date = new Date();

  date.setDate(date.getDate() + days);

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}