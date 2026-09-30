"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

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

type EstimateRow = {
  estimate: GenericEstimate;
  client: Client | null;
  property: Property | null;
  service: Service | null;
  title: string;
  scope: string;
  status: string;
  amount: number;
};

type StatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "approved"
  | "declined"
  | "expired"
  | "converted";

export default function EstimatesDashboardPage() {
  const [estimates, setEstimates] = useState<
    GenericEstimate[]
  >([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] =
    useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
        servicesResponse,
      ] = await Promise.all([
        supabase
          .from("estimate_requests")
          .select("*")
          .order("created_at", {
            ascending: false,
            nullsFirst: false,
          }),

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
        estimatesResponse.error ||
        clientsResponse.error ||
        propertiesResponse.error ||
        servicesResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setEstimates([]);
        setClients([]);
        setProperties([]);
        setServices([]);
      } else {
        setEstimates(
          (estimatesResponse.data ?? []) as GenericEstimate[],
        );
        setClients(
          (clientsResponse.data ?? []) as Client[],
        );
        setProperties(
          (propertiesResponse.data ?? []) as Property[],
        );
        setServices(
          (servicesResponse.data ?? []) as Service[],
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

  const rows = useMemo<EstimateRow[]>(() => {
    return estimates.map((estimate) => {
      const client =
        clients.find(
          (item) => item.id === estimate.client_id,
        ) ?? null;

      const property =
        properties.find(
          (item) => item.id === estimate.property_id,
        ) ?? null;

      const service =
        services.find(
          (item) => item.id === estimate.service_id,
        ) ?? null;

      return {
        estimate,
        client,
        property,
        service,
        title:
          stringValue(estimate.estimate_title) ||
          firstString(estimate, [
            "title",
            "service_name",
            "service_type",
            "subject",
          ]) ||
          "Untitled Estimate",
        scope:
          stringValue(estimate.scope_of_work) ||
          firstString(estimate, [
            "description",
            "project_description",
            "request_details",
            "details",
            "notes",
            "message",
          ]),
        status:
          stringValue(estimate.estimate_status) ||
          "draft",
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
      };
    });
  }, [clients, estimates, properties, services]);

  const summary = useMemo(() => {
    const counts = {
      draft: 0,
      sent: 0,
      approved: 0,
      declined: 0,
      expired: 0,
      converted: 0,
    };

    let pipelineValue = 0;
    let approvedAwaitingConversionValue = 0;

    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as keyof typeof counts] += 1;
      }

      if (
        !["declined", "expired", "converted"].includes(
          row.status,
        )
      ) {
        pipelineValue += row.amount;
      }

      if (
        row.status === "approved" &&
        !row.estimate.converted_job_id
      ) {
        approvedAwaitingConversionValue += row.amount;
      }
    }

    return {
      total: rows.length,
      ...counts,
      pipelineValue,
      approvedAwaitingConversionValue,
      approvedAwaitingConversionCount: rows.filter(
        (row) =>
          row.status === "approved" &&
          !row.estimate.converted_job_id,
      ).length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText
      .trim()
      .toLowerCase();

    return rows.filter((row) => {
      if (
        statusFilter !== "all" &&
        row.status !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        row.title,
        row.scope,
        row.client?.client_name,
        row.property?.property_name,
        row.property?.street_address,
        row.service?.service_name,
        row.status,
      ].some((value) =>
        value
          ?.toLowerCase()
          .includes(normalizedSearch),
      );
    });
  }, [rows, searchText, statusFilter]);

  if (isLoading) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-black">
          Estimate Pipeline
        </h1>

        <p className="font-bold text-gray-500">
          Loading estimates…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Sales Pipeline
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Estimates
          </h1>

          <p className="mt-2 text-gray-600">
            Track estimates from draft through approval,
            conversion, and scheduled work.
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Estimates"
          value={summary.total.toString()}
        />

        <SummaryCard
          label="Pipeline Value"
          value={formatCurrency(
            summary.pipelineValue,
          )}
        />

        <SummaryCard
          label="Approved Awaiting Conversion"
          value={formatCurrency(
            summary.approvedAwaitingConversionValue,
          )}
          note={`${summary.approvedAwaitingConversionCount} estimate${
            summary.approvedAwaitingConversionCount === 1
              ? ""
              : "s"
          }`}
          warning={
            summary.approvedAwaitingConversionCount > 0
          }
        />

        <SummaryCard
          label="Converted"
          value={summary.converted.toString()}
          positive={summary.converted > 0}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatusCard
          label="Draft"
          count={summary.draft}
        />
        <StatusCard
          label="Sent"
          count={summary.sent}
        />
        <StatusCard
          label="Approved"
          count={summary.approved}
        />
        <StatusCard
          label="Declined"
          count={summary.declined}
        />
        <StatusCard
          label="Expired"
          count={summary.expired}
        />
        <StatusCard
          label="Converted"
          count={summary.converted}
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
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
              placeholder="Estimate, client, property, service, or scope"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Status
            </span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as StatusFilter,
                )
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="expired">Expired</option>
              <option value="converted">Converted</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        {filteredRows.map((row) => {
          const isConverted = Boolean(
            row.estimate.converted_job_id,
          );

          const needsConversion =
            row.status === "approved" && !isConverted;

          return (
            <article
              key={row.estimate.id}
              className={`rounded-2xl border p-6 shadow-sm ${
                needsConversion
                  ? "border-amber-200 bg-amber-50"
                  : isConverted
                    ? "border-green-200 bg-green-50"
                    : "bg-white"
              }`}
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getStatusClasses(
                        row.status,
                      )}`}
                    >
                      {formatStatus(row.status)}
                    </span>

                    {needsConversion && (
                      <span className="rounded-full bg-amber-700 px-3 py-1 text-xs font-black uppercase text-white">
                        Ready to Convert
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-xl font-black text-gray-950">
                    {row.title}
                  </h2>

                  <p className="mt-2 text-sm font-bold text-gray-700">
                    {row.client?.client_name ||
                      "No customer"}
                    {" · "}
                    {row.property
                      ? formatProperty(row.property)
                      : "No property"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
                    <span>
                      Service:{" "}
                      {row.service?.service_name ||
                        "Not selected"}
                    </span>

                    <span>
                      Value:{" "}
                      <strong>
                        {formatCurrency(row.amount)}
                      </strong>
                    </span>

                    <span>
                      Created:{" "}
                      {formatDate(
                        row.estimate.created_at,
                      )}
                    </span>
                  </div>

                  {row.scope && (
                    <p className="mt-4 line-clamp-3 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {row.scope}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-3 sm:flex-row xl:flex-col">
                  <Link
                    href={`/admin/estimates/${row.estimate.id}`}
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-black text-gray-800"
                  >
                    View Estimate
                  </Link>

                  {isConverted ? (
                    <Link
                      href={`/work-orders/${row.estimate.converted_job_id}`}
                      className="rounded-xl bg-green-700 px-5 py-3 text-center text-sm font-black text-white"
                    >
                      Open Work Order
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/estimates/${row.estimate.id}/convert`}
                      className={`rounded-xl px-5 py-3 text-center text-sm font-black text-white ${
                        needsConversion
                          ? "bg-bakerssPink"
                          : "bg-gray-950"
                      }`}
                    >
                      Convert to Work Order
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
            <h2 className="text-xl font-black">
              No estimates found
            </h2>

            <p className="mt-2 text-sm font-bold text-gray-500">
              No estimates match the current search and
              status filter.
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
  note,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string;
  note?: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        warning
          ? "border-amber-200 bg-amber-50"
          : positive
            ? "border-green-200 bg-green-50"
            : "bg-white"
      }`}
    >
      <p className="text-sm font-black text-gray-500">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-black ${
          warning
            ? "text-amber-800"
            : positive
              ? "text-green-800"
              : "text-gray-950"
        }`}
      >
        {value}
      </p>

      {note && (
        <p className="mt-2 text-sm font-bold text-gray-600">
          {note}
        </p>
      )}
    </div>
  );
}

function StatusCard({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-gray-950">
        {count}
      </p>
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

function numericValue(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: unknown) {
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
  }).format(date);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getStatusClasses(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-800";
    case "converted":
      return "bg-purple-100 text-purple-800";
    case "declined":
      return "bg-red-100 text-red-800";
    case "expired":
      return "bg-gray-200 text-gray-700";
    case "sent":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}