"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type Estimate = Record<string, unknown> & {
  id: string;
  estimate_status?: string | null;
  estimate_title?: string | null;
  estimated_total?: number | string | null;
  client_id?: string | null;
  property_id?: string | null;
  converted_job_id?: string | null;
  sent_at?: string | null;
  expires_at?: string | null;
  last_follow_up_at?: string | null;
  next_follow_up_date?: string | null;
  follow_up_count?: number | null;
  follow_up_notes?: string | null;
  created_at?: string | null;
};

type Client = {
  id: string;
  client_name: string;
};

type Property = {
  id: string;
  property_name: string | null;
  street_address: string | null;
};

type FollowUpRow = {
  estimate: Estimate;
  client: Client | null;
  property: Property | null;
  title: string;
  status: string;
  amount: number;
  urgency:
    | "overdue"
    | "today"
    | "upcoming"
    | "expired"
    | "unscheduled";
};

type FilterType =
  | "all"
  | "overdue"
  | "today"
  | "upcoming"
  | "expired"
  | "unscheduled";

export default function EstimateFollowUpPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] =
    useState<Property[]>([]);

  const [filter, setFilter] = useState<FilterType>("all");
  const [searchText, setSearchText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(
    null,
  );
  const [notesById, setNotesById] = useState<
    Record<string, string>
  >({});
  const [nextDateById, setNextDateById] = useState<
    Record<string, string>
  >({});

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const loadPage = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const [
        estimatesResponse,
        clientsResponse,
        propertiesResponse,
      ] = await Promise.all([
        supabase
          .from("estimate_requests")
          .select("*")
          .is("converted_job_id", null)
          .not(
            "estimate_status",
            "in",
            '("declined","converted")',
          )
          .order("next_follow_up_date", {
            ascending: true,
            nullsFirst: false,
          })
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("clients")
          .select("id, client_name")
          .order("client_name", { ascending: true }),

        supabase
          .from("properties")
          .select(
            "id, property_name, street_address",
          ),
      ]);

      const firstError =
        estimatesResponse.error ||
        clientsResponse.error ||
        propertiesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setEstimates([]);
        setClients([]);
        setProperties([]);
      } else {
        const loadedEstimates =
          (estimatesResponse.data ?? []) as Estimate[];

        setEstimates(loadedEstimates);
        setClients(
          (clientsResponse.data ?? []) as Client[],
        );
        setProperties(
          (propertiesResponse.data ?? []) as Property[],
        );

        setNotesById(
          Object.fromEntries(
            loadedEstimates.map((estimate) => [
              estimate.id,
              estimate.follow_up_notes ?? "",
            ]),
          ),
        );

        setNextDateById(
          Object.fromEntries(
            loadedEstimates.map((estimate) => [
              estimate.id,
              estimate.next_follow_up_date ?? "",
            ]),
          ),
        );
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const rows = useMemo<FollowUpRow[]>(() => {
    const today = getTodayInput();

    return estimates.map((estimate) => {
      const status =
        stringValue(estimate.estimate_status) ||
        "draft";

      const expiresAt =
        stringValue(estimate.expires_at);
      const nextFollowUp =
        stringValue(estimate.next_follow_up_date);

      let urgency: FollowUpRow["urgency"] =
        "unscheduled";

      if (
        expiresAt &&
        expiresAt < today &&
        status !== "approved"
      ) {
        urgency = "expired";
      } else if (nextFollowUp) {
        if (nextFollowUp < today) {
          urgency = "overdue";
        } else if (nextFollowUp === today) {
          urgency = "today";
        } else {
          urgency = "upcoming";
        }
      }

      return {
        estimate,
        client:
          clients.find(
            (client) =>
              client.id === estimate.client_id,
          ) ?? null,
        property:
          properties.find(
            (property) =>
              property.id === estimate.property_id,
          ) ?? null,
        title:
          stringValue(estimate.estimate_title) ||
          firstString(estimate, [
            "title",
            "service_name",
            "service_type",
            "subject",
          ]) ||
          "Untitled Estimate",
        status,
        amount: numericValue(
          estimate.estimated_total ??
            firstNumber(estimate, [
              "total_amount",
              "estimate_amount",
              "approved_amount",
              "price",
              "amount",
            ]),
        ),
        urgency,
      };
    });
  }, [clients, estimates, properties]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText
      .trim()
      .toLowerCase();

    return rows.filter((row) => {
      if (
        filter !== "all" &&
        row.urgency !== filter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        row.title,
        row.client?.client_name,
        row.property?.property_name,
        row.property?.street_address,
        row.status,
      ].some((value) =>
        value
          ?.toLowerCase()
          .includes(normalizedSearch),
      );
    });
  }, [filter, rows, searchText]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      overdue: rows.filter(
        (row) => row.urgency === "overdue",
      ).length,
      today: rows.filter(
        (row) => row.urgency === "today",
      ).length,
      upcoming: rows.filter(
        (row) => row.urgency === "upcoming",
      ).length,
      expired: rows.filter(
        (row) => row.urgency === "expired",
      ).length,
      unscheduled: rows.filter(
        (row) => row.urgency === "unscheduled",
      ).length,
      value: rows.reduce(
        (total, row) => total + row.amount,
        0,
      ),
    };
  }, [rows]);

  async function recordFollowUp(
    estimate: Estimate,
  ) {
    if (activeId) {
      return;
    }

    const nextDate = nextDateById[estimate.id] ?? "";
    const notes = notesById[estimate.id]?.trim() ?? "";

    if (!nextDate) {
      setErrorMessage(
        "Select the next follow-up date before recording the follow-up.",
      );
      return;
    }

    setActiveId(estimate.id);
    setErrorMessage("");
    setSuccessMessage("");

    const nextCount =
      Number(estimate.follow_up_count ?? 0) + 1;

    const { error } = await supabase
      .from("estimate_requests")
      .update({
        last_follow_up_at: new Date().toISOString(),
        next_follow_up_date: nextDate,
        follow_up_count: nextCount,
        follow_up_notes: notes || null,
      })
      .eq("id", estimate.id);

    if (error) {
      setErrorMessage(error.message);
      setActiveId(null);
      return;
    }

    await supabase.from("activity_log").insert({
      actor_profile_id: null,
      action: "estimate_follow_up_recorded",
      activity_type: "estimate_follow_up",
      entity_type: "estimate",
      entity_id: estimate.id,
      metadata: {
        next_follow_up_date: nextDate,
        follow_up_count: nextCount,
        note: notes || null,
      },
    });

    setSuccessMessage(
      "Estimate follow-up recorded.",
    );
    setActiveId(null);
    await loadPage(true);
  }

  async function markSent(estimate: Estimate) {
    if (activeId) {
      return;
    }

    setActiveId(estimate.id);
    setErrorMessage("");
    setSuccessMessage("");

    const defaultNextDate = addDaysToInput(
      getTodayInput(),
      3,
    );

    const { error } = await supabase
      .from("estimate_requests")
      .update({
        estimate_status: "sent",
        sent_at:
          estimate.sent_at ||
          new Date().toISOString(),
        next_follow_up_date:
          estimate.next_follow_up_date ||
          defaultNextDate,
      })
      .eq("id", estimate.id);

    if (error) {
      setErrorMessage(error.message);
      setActiveId(null);
      return;
    }

    setSuccessMessage(
      "Estimate marked sent and follow-up scheduled.",
    );
    setActiveId(null);
    await loadPage(true);
  }

  if (isLoading) {
    return (
      <main>
        <h1 className="text-3xl font-black">
          Estimate Follow-Up
        </h1>

        <p className="mt-3 font-bold text-gray-500">
          Loading follow-up queue…
        </p>
      </main>
    );
  }

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
            Sales Follow-Up
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Estimate Follow-Up Queue
          </h1>

          <p className="mt-2 text-gray-600">
            Track sent estimates, overdue follow-ups,
            expiration dates, notes, and next actions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPage(true)}
          disabled={isRefreshing}
          className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Open Estimates"
          value={summary.total.toString()}
        />

        <SummaryCard
          label="Overdue Follow-Ups"
          value={summary.overdue.toString()}
          warning={summary.overdue > 0}
        />

        <SummaryCard
          label="Due Today"
          value={summary.today.toString()}
          warning={summary.today > 0}
        />

        <SummaryCard
          label="Open Pipeline Value"
          value={formatCurrency(summary.value)}
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label>
            <span className="mb-2 block text-sm font-black">
              Search
            </span>

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="Estimate, client, property, or status"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="All"
              selected={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterButton
              label={`Overdue (${summary.overdue})`}
              selected={filter === "overdue"}
              onClick={() => setFilter("overdue")}
            />
            <FilterButton
              label={`Today (${summary.today})`}
              selected={filter === "today"}
              onClick={() => setFilter("today")}
            />
            <FilterButton
              label={`Upcoming (${summary.upcoming})`}
              selected={filter === "upcoming"}
              onClick={() => setFilter("upcoming")}
            />
            <FilterButton
              label={`Expired (${summary.expired})`}
              selected={filter === "expired"}
              onClick={() => setFilter("expired")}
            />
            <FilterButton
              label={`Unscheduled (${summary.unscheduled})`}
              selected={filter === "unscheduled"}
              onClick={() =>
                setFilter("unscheduled")
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {filteredRows.map((row) => (
          <article
            key={row.estimate.id}
            className={`rounded-2xl border p-6 shadow-sm ${getUrgencyCardClasses(
              row.urgency,
            )}`}
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getUrgencyBadgeClasses(
                      row.urgency,
                    )}`}
                  >
                    {formatStatus(row.urgency)}
                  </span>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-gray-700">
                    {formatStatus(row.status)}
                  </span>
                </div>

                <h2 className="mt-3 text-xl font-black">
                  {row.title}
                </h2>

                <p className="mt-2 text-sm font-bold text-gray-700">
                  {row.client?.client_name ||
                    "No customer"}
                  {" · "}
                  {row.property?.property_name ||
                    row.property?.street_address ||
                    "No property"}
                </p>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
                  <span>
                    Value:{" "}
                    <strong>
                      {formatCurrency(row.amount)}
                    </strong>
                  </span>

                  <span>
                    Sent:{" "}
                    {formatDateTime(
                      row.estimate.sent_at,
                    )}
                  </span>

                  <span>
                    Last follow-up:{" "}
                    {formatDateTime(
                      row.estimate.last_follow_up_at,
                    )}
                  </span>

                  <span>
                    Follow-ups:{" "}
                    {row.estimate.follow_up_count ?? 0}
                  </span>

                  <span>
                    Expires:{" "}
                    {formatDate(
                      row.estimate.expires_at,
                    )}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-3">
                <Link
                  href={`/admin/estimates/${row.estimate.id}`}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800"
                >
                  View Estimate
                </Link>

                {row.status === "draft" && (
                  <button
                    type="button"
                    onClick={() =>
                      void markSent(row.estimate)
                    }
                    disabled={Boolean(activeId)}
                    className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    Mark Sent
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-sm font-black">
                  Follow-Up Notes
                </span>

                <input
                  value={
                    notesById[row.estimate.id] ?? ""
                  }
                  onChange={(event) =>
                    setNotesById((current) => ({
                      ...current,
                      [row.estimate.id]:
                        event.target.value,
                    }))
                  }
                  placeholder="What was discussed or what is needed next?"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-black">
                  Next Follow-Up
                </span>

                <input
                  type="date"
                  value={
                    nextDateById[row.estimate.id] ??
                    ""
                  }
                  onChange={(event) =>
                    setNextDateById((current) => ({
                      ...current,
                      [row.estimate.id]:
                        event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  void recordFollowUp(row.estimate)
                }
                disabled={Boolean(activeId)}
                className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {activeId === row.estimate.id
                  ? "Saving…"
                  : "Record Follow-Up"}
              </button>
            </div>
          </article>
        ))}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
            <h2 className="text-xl font-black">
              No follow-ups found
            </h2>

            <p className="mt-2 text-sm font-bold text-gray-500">
              No estimates match the current search and
              follow-up filter.
            </p>
          </div>
        )}
      </section>
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
          : "bg-white"
      }`}
    >
      <p className="text-sm font-black text-gray-500">
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
      className={`rounded-xl px-4 py-3 text-sm font-black ${
        selected
          ? "bg-gray-950 text-white"
          : "border border-gray-300 bg-white text-gray-800"
      }`}
    >
      {label}
    </button>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstString(
  estimate: Estimate,
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
  estimate: Estimate,
  keys: string[],
) {
  for (const key of keys) {
    const value = estimate[key];
    const number = Number(value);

    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return null;
}

function numericValue(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function getTodayInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToInput(
  input: string,
  days: number,
) {
  const date = new Date(`${input}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "Not set";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value) {
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

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getUrgencyCardClasses(
  urgency: FollowUpRow["urgency"],
) {
  switch (urgency) {
    case "overdue":
      return "border-red-200 bg-red-50";
    case "today":
      return "border-amber-200 bg-amber-50";
    case "expired":
      return "border-gray-300 bg-gray-100";
    case "upcoming":
      return "border-blue-200 bg-blue-50";
    default:
      return "bg-white";
  }
}

function getUrgencyBadgeClasses(
  urgency: FollowUpRow["urgency"],
) {
  switch (urgency) {
    case "overdue":
      return "bg-red-700 text-white";
    case "today":
      return "bg-amber-700 text-white";
    case "expired":
      return "bg-gray-700 text-white";
    case "upcoming":
      return "bg-blue-700 text-white";
    default:
      return "bg-gray-200 text-gray-800";
  }
}