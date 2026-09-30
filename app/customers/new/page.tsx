"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

export default function NewCustomerPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const cleanName = clientName.trim();
    if (!cleanName) {
      setErrorMessage("Enter the customer name.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from("clients").insert({
      client_name: cleanName,
      email: email.trim() || null,
      phone: phone.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push("/customers");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/customers"
          className="text-sm font-black text-bakerssPink transition hover:opacity-70"
        >
          ← Back to Customers
        </Link>

        <h1 className="mt-3 text-3xl font-black">Add Customer</h1>
        <p className="mt-2 text-gray-600">
          Create the customer record before adding service properties.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <div>
            <label htmlFor="clientName" className="mb-2 block text-sm font-black">
              Customer Name
            </label>
            <input
              id="clientName"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              required
              autoFocus
              placeholder="Customer or company name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-black">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="customer@example.com"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-black">Phone</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="843-555-1234"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/customers" className="rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-black transition hover:bg-gray-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving Customer..." : "Save Customer"}
          </button>
        </div>
      </form>
    </div>
  );
}