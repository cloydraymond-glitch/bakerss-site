"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

export default function NewServicePage() {
  const router = useRouter();
  const [serviceName, setServiceName] = useState("");
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const cleanServiceName = serviceName.trim();
    const cleanDuration = defaultDurationMinutes.trim();

    if (!cleanServiceName) {
      setErrorMessage("Enter the service name.");
      return;
    }

    let durationValue: number | null = null;

    if (cleanDuration) {
      const parsedDuration = Number(cleanDuration);

      if (
        !Number.isInteger(parsedDuration) ||
        parsedDuration < 15 ||
        parsedDuration > 1440
      ) {
        setErrorMessage(
          "Default duration must be a whole number from 15 to 1440 minutes.",
        );
        return;
      }

      durationValue = parsedDuration;
    }

    setIsSaving(true);

    const { error } = await supabase.from("services").insert({
      service_name: cleanServiceName,
      default_duration_minutes: durationValue,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push("/services");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/services"
          className="text-sm font-black text-bakerssPink transition hover:opacity-70"
        >
          ← Back to Services
        </Link>

        <h1 className="mt-3 text-3xl font-black">Add Service</h1>

        <p className="mt-2 text-gray-600">
          Create a service that can be selected on work orders and invoices.
          The default duration is used by Dispatch for technician capacity
          planning.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="serviceName"
            className="mb-2 block text-sm font-black"
          >
            Service Name
          </label>

          <input
            id="serviceName"
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            required
            autoFocus
            placeholder="Example: Lawn Care, Interior Cleaning, Irrigation Repair"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
          />
        </div>

        <div className="mt-5">
          <label
            htmlFor="defaultDurationMinutes"
            className="mb-2 block text-sm font-black"
          >
            Default Duration
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              id="defaultDurationMinutes"
              type="number"
              min="15"
              max="1440"
              step="15"
              value={defaultDurationMinutes}
              onChange={(event) =>
                setDefaultDurationMinutes(event.target.value)
              }
              placeholder="Example: 60"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
            />

            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
              Minutes
            </div>
          </div>

          <p className="mt-2 text-sm text-gray-500">
            Optional. Dispatch will use this as the expected duration unless
            the individual work order has its own estimate.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {[30, 45, 60, 90, 120, 180, 240].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() =>
                  setDefaultDurationMinutes(minutes.toString())
                }
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-100"
              >
                {formatDuration(minutes)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-black text-blue-900">
            Dispatch Capacity
          </p>
          <p className="mt-1 text-sm text-blue-800">
            Example: if Lawn Care is set to 45 minutes, each Lawn Care work
            order can use 45 minutes toward the technician&apos;s daily
            workload unless you override that specific work order.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/services"
            className="rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-black transition hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving Service..." : "Save Service"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder} min`;
  }

  if (remainder === 0) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  return `${hours}h ${remainder}m`;
}