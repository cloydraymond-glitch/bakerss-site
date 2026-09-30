"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

type Customer = { id: string; client_name: string };

export default function NewPropertyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedClientId = searchParams.get("clientId") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [clientId, setClientId] = useState(requestedClientId);
  const [propertyName, setPropertyName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("SC");
  const [zipCode, setZipCode] = useState("");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_name")
        .order("client_name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setIsLoadingCustomers(false);
        return;
      }

      setCustomers((data ?? []) as Customer[]);
      setIsLoadingCustomers(false);
    }

    void loadCustomers();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!clientId) {
      setErrorMessage("Select the customer who owns or manages this property.");
      return;
    }

    if (!streetAddress.trim()) {
      setErrorMessage("Enter the service address.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("properties").insert({
      client_id: clientId,
      property_name: propertyName.trim() || null,
      street_address: streetAddress.trim(),
      city: city.trim() || null,
      state: state.trim() || null,
      zip_code: zipCode.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push(requestedClientId ? `/properties?clientId=${requestedClientId}` : "/properties");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/properties" className="text-sm font-black text-bakerssPink transition hover:opacity-70">
          ← Back to Properties
        </Link>
        <h1 className="mt-3 text-3xl font-black">Add Property</h1>
        <p className="mt-2 text-gray-600">Add a customer service location for work orders and scheduling.</p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <div>
            <label htmlFor="clientId" className="mb-2 block text-sm font-black">Customer</label>
            <select
              id="clientId"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
              disabled={isLoadingCustomers}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:opacity-60"
            >
              <option value="">{isLoadingCustomers ? "Loading customers..." : "Select a customer"}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.client_name}</option>
              ))}
            </select>
            {customers.length === 0 && !isLoadingCustomers && (
              <p className="mt-2 text-sm font-bold text-amber-700">Add a customer before creating a property.</p>
            )}
          </div>

          <div>
            <label htmlFor="propertyName" className="mb-2 block text-sm font-black">Property Name</label>
            <input
              id="propertyName"
              value={propertyName}
              onChange={(event) => setPropertyName(event.target.value)}
              placeholder="Example: Primary Home, Unit 204, Landing at Coventry"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />
          </div>

          <div>
            <label htmlFor="streetAddress" className="mb-2 block text-sm font-black">Street Address</label>
            <input
              id="streetAddress"
              value={streetAddress}
              onChange={(event) => setStreetAddress(event.target.value)}
              required
              placeholder="1020 Royal Tern Drive"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-[1.4fr_0.6fr_0.8fr]">
            <div>
              <label htmlFor="city" className="mb-2 block text-sm font-black">City</label>
              <input
                id="city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Myrtle Beach"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
            <div>
              <label htmlFor="state" className="mb-2 block text-sm font-black">State</label>
              <input
                id="state"
                value={state}
                onChange={(event) => setState(event.target.value.toUpperCase())}
                maxLength={2}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 uppercase outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
            <div>
              <label htmlFor="zipCode" className="mb-2 block text-sm font-black">ZIP Code</label>
              <input
                id="zipCode"
                value={zipCode}
                onChange={(event) => setZipCode(event.target.value)}
                placeholder="29577"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/properties" className="rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-black transition hover:bg-gray-50">Cancel</Link>
          <button
            type="submit"
            disabled={isSaving || isLoadingCustomers || customers.length === 0}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving Property..." : "Save Property"}
          </button>
        </div>
      </form>
    </div>
  );
}