"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRecurringRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/recurring");
  }, [router]);

  return (
    <main className="rounded-2xl border bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-black">
        Opening Recurring Services
      </h1>

      <p className="mt-2 text-sm text-gray-500">
        Redirecting to the recurring-services dashboard…
      </p>
    </main>
  );
}