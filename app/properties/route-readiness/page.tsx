"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase/client";

type Property = {
  id: string;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  geocode_source: string | null;
};

type Filter = "all" | "ready" | "missing";

type EditState = {
  latitude: string;
  longitude: string;
  geocodeSource: string;
};

export default function PropertyRouteReadinessPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchText, setSearchText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    latitude: "",
    longitude: "",
    geocodeSource: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [geocodingId, setGeocodingId] =
    useState<string | null>(null);
  const [isBulkGeocoding, setIsBulkGeocoding] =
    useState(false);
  const [bulkProgress, setBulkProgress] =
    useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadProperties = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("properties")
      .select(`
        id,
        property_name,
        street_address,
        city,
        state,
        latitude,
        longitude,
        geocoded_at,
        geocode_source
      `)
      .order("street_address", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setProperties([]);
    } else {
      setProperties((data ?? []) as Property[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  const summary = useMemo(() => {
    const ready = properties.filter(hasCoordinates).length;
    const missing = properties.length - ready;

    return {
      total: properties.length,
      ready,
      missing,
      readyPercent:
        properties.length > 0
          ? Math.round((ready / properties.length) * 100)
          : 0,
    };
  }, [properties]);

  const filteredProperties = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return properties.filter((property) => {
      const ready = hasCoordinates(property);

      if (filter === "ready" && !ready) {
        return false;
      }

      if (filter === "missing" && ready) {
        return false;
      }

      if (!query) {
        return true;
      }

      const values = [
        property.property_name,
        property.street_address,
        property.city,
        property.state,
        property.geocode_source,
      ];

      return values.some((value) =>
        value?.toLowerCase().includes(query),
      );
    });
  }, [filter, properties, searchText]);

  function startEditing(property: Property) {
    setEditingId(property.id);
    setEditState({
      latitude: property.latitude?.toString() ?? "",
      longitude: property.longitude?.toString() ?? "",
      geocodeSource: property.geocode_source ?? "manual",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditState({
      latitude: "",
      longitude: "",
      geocodeSource: "",
    });
  }

  async function saveCoordinates(
    event: FormEvent<HTMLFormElement>,
    property: Property,
  ) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const latitude =
      editState.latitude.trim() === ""
        ? null
        : Number(editState.latitude);

    const longitude =
      editState.longitude.trim() === ""
        ? null
        : Number(editState.longitude);

    if (
      (latitude === null) !==
      (longitude === null)
    ) {
      setErrorMessage(
        "Enter both latitude and longitude, or leave both blank.",
      );
      return;
    }

    if (
      latitude !== null &&
      (!Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90)
    ) {
      setErrorMessage(
        "Latitude must be between -90 and 90.",
      );
      return;
    }

    if (
      longitude !== null &&
      (!Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180)
    ) {
      setErrorMessage(
        "Longitude must be between -180 and 180.",
      );
      return;
    }

    setIsSaving(true);

    const source =
      latitude === null || longitude === null
        ? null
        : editState.geocodeSource.trim() || "manual";

    const { error } = await supabase
      .from("properties")
      .update({
        latitude,
        longitude,
        geocoded_at:
          latitude !== null && longitude !== null
            ? new Date().toISOString()
            : null,
        geocode_source: source,
      })
      .eq("id", property.id);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage(
      latitude !== null && longitude !== null
        ? `Coordinates saved for ${propertyLabel(property)}.`
        : `Coordinates cleared for ${propertyLabel(property)}.`,
    );

    setEditingId(null);
    setEditState({
      latitude: "",
      longitude: "",
      geocodeSource: "",
    });
    setIsSaving(false);
    await loadProperties(true);
  }

  async function geocodeProperty(property: Property) {
    if (geocodingId || isBulkGeocoding) {
      return;
    }

    setGeocodingId(property.id);
    setErrorMessage("");
    setSuccessMessage("");

    const response = await fetch("/api/geocode-property", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        propertyId: property.id,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setErrorMessage(
        payload?.error ??
          `Unable to geocode ${propertyLabel(property)}.`,
      );
      setGeocodingId(null);
      return;
    }

    setSuccessMessage(
      `Coordinates found for ${propertyLabel(property)}.`,
    );
    setGeocodingId(null);
    await loadProperties(true);
  }

  async function geocodeMissingProperties() {
    if (isBulkGeocoding || geocodingId) {
      return;
    }

    const missingProperties = properties.filter(
      (property) =>
        !hasCoordinates(property) &&
        Boolean(property.street_address) &&
        Boolean(property.city) &&
        Boolean(property.state),
    );

    if (missingProperties.length === 0) {
      setSuccessMessage(
        "All properties with complete addresses are already route-ready.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Geocode ${missingProperties.length} properties with missing coordinates?`,
    );

    if (!confirmed) {
      return;
    }

    setIsBulkGeocoding(true);
    setBulkProgress({
      current: 0,
      total: missingProperties.length,
    });
    setErrorMessage("");
    setSuccessMessage("");

    let successCount = 0;
    let failureCount = 0;

    for (
      let index = 0;
      index < missingProperties.length;
      index += 1
    ) {
      const property = missingProperties[index];

      setBulkProgress({
        current: index + 1,
        total: missingProperties.length,
      });

      try {
        const response = await fetch("/api/geocode-property", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            propertyId: property.id,
          }),
        });

        if (response.ok) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      } catch {
        failureCount += 1;
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, 250),
      );
    }

    setIsBulkGeocoding(false);
    setBulkProgress({ current: 0, total: 0 });

    if (failureCount === 0) {
      setSuccessMessage(
        `${successCount} properties were geocoded successfully.`,
      );
    } else {
      setSuccessMessage(
        `${successCount} properties were geocoded. ${failureCount} could not be matched and may need address cleanup or manual coordinates.`,
      );
    }

    await loadProperties(true);
  }

  if (isLoading) {
    return (
      <main className="space-y-4">
        <h1 className="text-3xl font-black">
          Property Route Readiness
        </h1>
        <p className="font-bold text-gray-500">
          Loading properties…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Dispatch Intelligence
          </p>
          <h1 className="mt-1 text-3xl font-black">
            Property Route Readiness
          </h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Verify which service locations have coordinates available for
            route optimization and travel-time calculations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/properties"
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800"
          >
            Properties
          </Link>

          <Link
            href="/dispatch"
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800"
          >
            Dispatch
          </Link>

          <button
            type="button"
            onClick={() => void geocodeMissingProperties()}
            disabled={isBulkGeocoding || Boolean(geocodingId)}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isBulkGeocoding
              ? `Geocoding ${bulkProgress.current}/${bulkProgress.total}…`
              : "Geocode Missing"}
          </button>

          <button
            type="button"
            onClick={() => void loadProperties(true)}
            disabled={isRefreshing}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Properties"
          value={summary.total.toString()}
        />
        <SummaryCard
          label="Route Ready"
          value={summary.ready.toString()}
          positive={summary.ready > 0}
        />
        <SummaryCard
          label="Missing Coordinates"
          value={summary.missing.toString()}
          warning={summary.missing > 0}
        />
        <SummaryCard
          label="Readiness"
          value={`${summary.readyPercent}%`}
          positive={
            summary.total > 0 &&
            summary.readyPercent === 100
          }
          warning={
            summary.total > 0 &&
            summary.readyPercent < 100
          }
        />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label>
            <span className="mb-2 block text-sm font-black">
              Search Properties
            </span>
            <input
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="Address, property name, city, or source"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["ready", "Route Ready"],
                ["missing", "Missing Coordinates"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-xl px-4 py-3 text-sm font-black ${
                  filter === value
                    ? "bg-gray-950 text-white"
                    : "border border-gray-300 bg-white text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <TableHeading>Property</TableHeading>
                <TableHeading>Route Status</TableHeading>
                <TableHeading>Coordinates</TableHeading>
                <TableHeading>Source</TableHeading>
                <TableHeading>Last Updated</TableHeading>
                <TableHeading>Actions</TableHeading>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredProperties.map((property) => {
                const ready = hasCoordinates(property);
                const editing = editingId === property.id;

                return (
                  <tr key={property.id}>
                    <TableCell>
                      <div className="min-w-[240px]">
                        <p className="font-black text-gray-950">
                          {propertyLabel(property)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {propertyLocation(property) || "No address"}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      {ready ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800">
                          Route Ready
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                          Needs Coordinates
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {editing ? (
                        <form
                          onSubmit={(event) =>
                            void saveCoordinates(
                              event,
                              property,
                            )
                          }
                          className="min-w-[310px] space-y-3"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              step="0.000001"
                              value={editState.latitude}
                              onChange={(event) =>
                                setEditState((current) => ({
                                  ...current,
                                  latitude: event.target.value,
                                }))
                              }
                              placeholder="Latitude"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />

                            <input
                              type="number"
                              step="0.000001"
                              value={editState.longitude}
                              onChange={(event) =>
                                setEditState((current) => ({
                                  ...current,
                                  longitude: event.target.value,
                                }))
                              }
                              placeholder="Longitude"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>

                          <input
                            value={editState.geocodeSource}
                            onChange={(event) =>
                              setEditState((current) => ({
                                ...current,
                                geocodeSource: event.target.value,
                              }))
                            }
                            placeholder="Source, e.g. manual"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />

                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                            >
                              {isSaving ? "Saving…" : "Save"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={isSaving}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : ready ? (
                        <div className="min-w-[180px] font-mono text-xs font-bold text-gray-700">
                          <div>{property.latitude}</div>
                          <div>{property.longitude}</div>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-gray-400">
                          Not set
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-sm font-bold text-gray-700">
                        {property.geocode_source || "—"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-sm text-gray-600">
                        {formatDateTime(property.geocoded_at)}
                      </span>
                    </TableCell>

                    <TableCell>
                      {!editing && (
                        <div className="flex min-w-[160px] flex-col gap-2">
                          {!ready && (
                            <button
                              type="button"
                              onClick={() =>
                                void geocodeProperty(property)
                              }
                              disabled={
                                Boolean(geocodingId) ||
                                isBulkGeocoding ||
                                !property.street_address ||
                                !property.city ||
                                !property.state
                              }
                              className="rounded-lg bg-bakerssPink px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                            >
                              {geocodingId === property.id
                                ? "Finding…"
                                : "Auto Geocode"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              startEditing(property)
                            }
                            disabled={
                              Boolean(geocodingId) ||
                              isBulkGeocoding
                            }
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-800 disabled:opacity-40"
                          >
                            {ready
                              ? "Edit Coordinates"
                              : "Manual Coordinates"}
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </tr>
                );
              })}

              {filteredProperties.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm font-bold text-gray-500"
                  >
                    No properties match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <p className="font-black text-blue-950">
          Route Intelligence Foundation
        </p>
        <p className="mt-1 text-sm text-blue-800">
          Use Auto Geocode to resolve US property addresses through the
          Census Geocoder. Properties with both latitude and longitude are
          route-ready. Manual coordinates remain available when an address
          cannot be matched automatically.
        </p>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
  positive = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
  positive?: boolean;
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
    </div>
  );
}

function TableHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="px-5 py-4 align-top text-sm text-gray-700">
      {children}
    </td>
  );
}

function hasCoordinates(property: Property) {
  return (
    property.latitude !== null &&
    property.longitude !== null
  );
}

function propertyLabel(property: Property) {
  return (
    property.property_name ||
    property.street_address ||
    "Unnamed Property"
  );
}

function propertyLocation(property: Property) {
  return [
    property.street_address,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}