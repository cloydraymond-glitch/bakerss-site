"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type RecurringServiceRecord = {
  id: string;
  service_name: string;
  frequency: string;
  preferred_day: string | null;
  preferred_time: string | null;
  start_date: string | null;
  end_date: string | null;
  price_per_visit: number | null;
  monthly_price: number | null;
  active: boolean | null;
  clients: {
    client_name: string;
  } | null;
  properties: {
    property_name: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
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

type StatusFilter =
  | "all"
  | "open"
  | "linked"
  | "skipped"
  | "cancelled";

export default function RecurringVisitsPage() {
  const params = useParams<{ id: string }>();
  const recurringServiceId = params?.id ?? "";

  const [service, setService] =
    useState<RecurringServiceRecord | null>(null);

  const [occurrences, setOccurrences] = useState<
    RecurringOccurrence[]
  >([]);

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [isLoading, setIsLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(
    null,
  );

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

    const [serviceResponse, occurrencesResponse] =
      await Promise.all([
        supabase
          .from("recurring_services")
          .select(`
            id,
            service_name,
            frequency,
            preferred_day,
            preferred_time,
            start_date,
            end_date,
            price_per_visit,
            monthly_price,
            active,
            clients (
              client_name
            ),
            properties (
              property_name,
              street_address,
              city,
              state
            )
          `)
          .eq("id", recurringServiceId)
          .single(),

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
          .eq("recurring_service_id", recurringServiceId)
          .order("scheduled_date", { ascending: true })
          .limit(500),
      ]);

    const firstError =
      serviceResponse.error || occurrencesResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    setService(
      serviceResponse.data as unknown as RecurringServiceRecord,
    );

    setOccurrences(
      (occurrencesResponse.data ??
        []) as RecurringOccurrence[],
    );

    setIsLoading(false);
  }, [recurringServiceId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const filteredOccurrences = useMemo(() => {
    return occurrences.filter((occurrence) => {
      if (statusFilter === "all") {
        return true;
      }

      if (statusFilter === "open") {
        return (
          !occurrence.job_id &&
          occurrence.occurrence_status !== "skipped" &&
          occurrence.occurrence_status !== "cancelled"
        );
      }

      if (statusFilter === "linked") {
        return Boolean(occurrence.job_id);
      }

      return occurrence.occurrence_status === statusFilter;
    });
  }, [occurrences, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: occurrences.length,
      open: occurrences.filter(
        (occurrence) =>
          !occurrence.job_id &&
          occurrence.occurrence_status !== "skipped" &&
          occurrence.occurrence_status !== "cancelled",
      ).length,
      linked: occurrences.filter((occurrence) =>
        Boolean(occurrence.job_id),
      ).length,
      skipped: occurrences.filter(
        (occurrence) =>
          occurrence.occurrence_status === "skipped",
      ).length,
      cancelled: occurrences.filter(
        (occurrence) =>
          occurrence.occurrence_status === "cancelled",
      ).length,
    };
  }, [occurrences]);

  async function createJob(
    occurrence: RecurringOccurrence,
  ) {
    if (
      workingId ||
      occurrence.job_id ||
      occurrence.occurrence_status === "skipped" ||
      occurrence.occurrence_status === "cancelled"
    ) {
      return;
    }

    setWorkingId(occurrence.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc(
      "create_job_from_recurring_occurrence",
      {
        p_occurrence_id: occurrence.id,
      },
    );

    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }

    setSuccessMessage(
      `Work order created for ${formatDate(
        occurrence.scheduled_date,
      )}.`,
    );

    setWorkingId(null);
    await loadPage();
  }

  async function changeStatus(
    occurrence: RecurringOccurrence,
    nextStatus: "generated" | "skipped" | "cancelled",
  ) {
    if (workingId || occurrence.job_id) {
      return;
    }

    setWorkingId(occurrence.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("recurring_service_occurrences")
      .update({
        occurrence_status: nextStatus,
      })
      .eq("id", occurrence.id)
      .is("job_id", null);

    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }

    const actionText =
      nextStatus === "generated"
        ? "restored"
        : nextStatus === "skipped"
          ? "skipped"
          : "cancelled";

    setSuccessMessage(
      `${formatDate(
        occurrence.scheduled_date,
      )} was ${actionText}.`,
    );

    setWorkingId(null);
    await loadPage();
  }

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Manage Recurring Visits
        </h1>

        <p className="text-gray-600">Loading visits…</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-pink-600">
            Recurring Services
          </p>

          <h1 className="mt-1 text-3xl font-black text-gray-950">
            Manage Visits
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            {service?.service_name ?? "Recurring Service"}
            {" · "}
            {service?.clients?.client_name ??
              "No client assigned"}
          </p>

          <p className="mt-1 text-sm text-gray-500">
            {formatProperty(service)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/recurring/${recurringServiceId}/edit`}
            className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm font-bold text-pink-700 hover:bg-pink-100"
          >
            Edit Service
          </Link>

          <Link
            href="/recurring"
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"
          >
            Back to Recurring
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
        <SummaryCard label="All Visits" value={counts.total} />
        <SummaryCard label="Open" value={counts.open} />
        <SummaryCard label="Linked Jobs" value={counts.linked} />
        <SummaryCard label="Skipped" value={counts.skipped} />
        <SummaryCard label="Cancelled" value={counts.cancelled} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <FilterButton
            label="All"
            selected={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />

          <FilterButton
            label="Open"
            selected={statusFilter === "open"}
            onClick={() => setStatusFilter("open")}
          />

          <FilterButton
            label="Linked"
            selected={statusFilter === "linked"}
            onClick={() => setStatusFilter("linked")}
          />

          <FilterButton
            label="Skipped"
            selected={statusFilter === "skipped"}
            onClick={() => setStatusFilter("skipped")}
          />

          <FilterButton
            label="Cancelled"
            selected={statusFilter === "cancelled"}
            onClick={() => setStatusFilter("cancelled")}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {filteredOccurrences.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="text-xl font-black text-gray-900">
              No visits found
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              There are no recurring visits in this filter.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredOccurrences.map((occurrence) => (
              <article
                key={occurrence.id}
                className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-center"
              >
                <div>
                  <p className="text-lg font-black text-gray-950">
                    {formatDate(occurrence.scheduled_date)}
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {service?.preferred_time
                      ? formatTime(service.preferred_time)
                      : "No preferred time"}
                  </p>
                </div>

                <div>
                  <StatusBadge
                    status={occurrence.occurrence_status}
                    linked={Boolean(occurrence.job_id)}
                  />

                  {occurrence.notes && (
                    <p className="mt-2 text-sm text-gray-600">
                      {occurrence.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {occurrence.job_id ? (
                    <Link
                      href={`/work-orders/${occurrence.job_id}`}
                      className="rounded-xl bg-green-100 px-4 py-2.5 text-sm font-black text-green-800 hover:bg-green-200"
                    >
                      View Job
                    </Link>
                  ) : occurrence.occurrence_status ===
                      "skipped" ||
                    occurrence.occurrence_status ===
                      "cancelled" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void changeStatus(
                          occurrence,
                          "generated",
                        )
                      }
                      disabled={Boolean(workingId)}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {workingId === occurrence.id
                        ? "Restoring…"
                        : "Restore"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void createJob(occurrence)
                        }
                        disabled={Boolean(workingId)}
                        className="rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {workingId === occurrence.id
                          ? "Working…"
                          : "Create Job"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void changeStatus(
                            occurrence,
                            "skipped",
                          )
                        }
                        disabled={Boolean(workingId)}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Skip
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void changeStatus(
                            occurrence,
                            "cancelled",
                          )
                        }
                        disabled={Boolean(workingId)}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-gray-950">
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
  status,
  linked,
}: {
  status: string;
  linked: boolean;
}) {
  if (linked) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-800">
        Job Created
      </span>
    );
  }

  const classes =
    status === "skipped"
      ? "bg-amber-100 text-amber-800"
      : status === "cancelled"
        ? "bg-red-100 text-red-800"
        : "bg-blue-100 text-blue-800";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${classes}`}
    >
      {formatText(status)}
    </span>
  );
}

function formatProperty(
  service: RecurringServiceRecord | null,
) {
  const property = service?.properties;

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

function formatDate(value: string) {
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
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function formatText(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}