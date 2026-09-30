"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type PropertyRecord = {
  id: string;
  client_id: string | null;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  clients: { client_name: string } | null;
};

export default function PropertiesPage() {
  const searchParams = useSearchParams();
  const requestedClientId = searchParams.get("clientId") || "";
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadProperties() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("properties")
        .select(`
          id,
          client_id,
          property_name,
          street_address,
          city,
          state,
          zip_code,
          clients ( client_name )
        `)
        .order("property_name", { ascending: true, nullsFirst: false });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setProperties((data ?? []) as unknown as PropertyRecord[]);
      setIsLoading(false);
    }

    void loadProperties();
  }, []);

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLowerCase();

    return properties.filter((property) => {
      if (requestedClientId && property.client_id !== requestedClientId) return false;
      if (!query) return true;

      return [
        property.property_name || "",
        property.street_address || "",
        property.city || "",
        property.state || "",
        property.zip_code || "",
        property.clients?.client_name || "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [properties, requestedClientId, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-black">Properties</h1>
          <p className="mt-1 text-gray-600">Manage customer service locations and addresses.</p>
        </div>

        <Link
          href={requestedClientId ? `/properties/new?clientId=${requestedClientId}` : "/properties/new"}
          className="rounded-xl bg-bakerssPink px-5 py-3 text-center text-sm font-black text-white shadow-sm transition hover:opacity-90"
        >
          Add Property
        </Link>
      </div>

      {requestedClientId && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm font-bold text-pink-800">Showing properties for one selected customer.</p>
          <Link href="/properties" className="text-sm font-black text-bakerssPink">Show All Properties</Link>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>
      )}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black">Property Directory</h2>
            <p className="mt-1 text-sm text-gray-500">
              {filteredProperties.length} location{filteredProperties.length === 1 ? "" : "s"} shown
            </p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, property, or address"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 md:max-w-sm"
          />
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-xl border border-dashed bg-gray-50 p-8 text-center font-bold text-gray-500">Loading properties...</div>
        ) : filteredProperties.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed bg-gray-50 p-8 text-center">
            <h3 className="text-lg font-black">No properties found</h3>
            <p className="mt-2 text-sm text-gray-500">Add a customer property to begin scheduling service work.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {filteredProperties.map((property) => (
              <article key={property.id} className="rounded-2xl border bg-gray-50 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
                  {property.clients?.client_name || "No customer"}
                </p>
                <h3 className="mt-2 text-lg font-black">
                  {property.property_name || property.street_address || "Unnamed property"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {formatAddress(property) || "No address entered"}
                </p>
                <Link
                  href={`/work-orders/new?propertyId=${property.id}`}
                  className="mt-4 inline-block rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black transition hover:bg-gray-50"
                >
                  Create Work Order
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatAddress(property: PropertyRecord) {
  return [property.street_address, property.city, property.state, property.zip_code]
    .filter(Boolean)
    .join(", ");
}