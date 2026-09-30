"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Customer = {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("clients")
        .select("id, client_name, email, phone, created_at")
        .order("client_name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setCustomers((data ?? []) as Customer[]);
      setIsLoading(false);
    }

    void loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) =>
      [customer.client_name, customer.email || "", customer.phone || ""].some(
        (value) => value.toLowerCase().includes(query),
      ),
    );
  }, [customers, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-black">Customers</h1>
          <p className="mt-1 text-gray-600">
            Manage customer records and service relationships.
          </p>
        </div>

        <Link
          href="/customers/new"
          className="rounded-xl bg-bakerssPink px-5 py-3 text-center text-sm font-black text-white shadow-sm transition hover:opacity-90"
        >
          Add Customer
        </Link>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black">Customer Directory</h2>
            <p className="mt-1 text-sm text-gray-500">
              {customers.length} customer{customers.length === 1 ? "" : "s"}
            </p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 md:max-w-sm"
          />
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-xl border border-dashed bg-gray-50 p-8 text-center font-bold text-gray-500">
            Loading customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed bg-gray-50 p-8 text-center">
            <h3 className="text-lg font-black">
              {customers.length === 0
                ? "No customers yet"
                : "No customers match your search"}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {customers.length === 0
                ? "Add your first customer to begin creating properties and work orders."
                : "Try a different search term."}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto_auto] gap-4 bg-gray-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-gray-500 md:grid">
              <span>Customer</span>
              <span>Email</span>
              <span>Phone</span>
              <span />
              <span />
            </div>

            <div className="divide-y">
              {filteredCustomers.map((customer) => (
                <article
                  key={customer.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[1.4fr_1fr_1fr_auto_auto] md:items-center"
                >
                  <div>
                    <p className="font-black text-gray-950">
                      {customer.client_name}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Customer ID: {customer.id}
                    </p>
                  </div>

                  <p className="text-sm font-semibold text-gray-700">
                    {customer.email || "No email"}
                  </p>

                  <p className="text-sm font-semibold text-gray-700">
                    {customer.phone || "No phone"}
                  </p>

                  <Link
                    href={`/customers/${customer.id}`}
                    className="rounded-xl bg-gray-950 px-4 py-2 text-center text-sm font-black text-white transition hover:opacity-90"
                  >
                    Manage
                  </Link>

                  <Link
                    href={`/properties?clientId=${customer.id}`}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-black transition hover:bg-gray-50"
                  >
                    Properties
                  </Link>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}