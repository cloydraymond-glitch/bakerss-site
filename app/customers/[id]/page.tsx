"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

type Customer = {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
};

type PortalAccess = {
  id: string;
  client_id: string;
  profile_id: string;
  portal_role: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
  } | null;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [access, setAccess] = useState<PortalAccess[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [portalEmail, setPortalEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your administrator session has expired. Sign in again.");
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await authFetch(`/api/admin/client-access?clientId=${encodeURIComponent(clientId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Customer could not be loaded.");
      const nextCustomer = body.client as Customer;
      setCustomer(nextCustomer);
      setAccess((body.access || []) as PortalAccess[]);
      setName(nextCustomer.client_name || "");
      setEmail(nextCustomer.email || "");
      setPhone(nextCustomer.phone || "");
      setPortalEmail(nextCustomer.email || "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Customer could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (!name.trim()) {
      setErrorMessage("Customer name is required.");
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        client_name: name.trim(),
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
      })
      .eq("id", clientId);
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage("Customer information updated.");
    await load();
  }

  async function inviteClient() {
    setErrorMessage("");
    setSuccessMessage("");
    const cleanEmail = portalEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage("Enter the email address the customer will use for the portal.");
      return;
    }
    setIsWorking(true);
    try {
      const response = await authFetch("/api/admin/client-access", {
        method: "POST",
        body: JSON.stringify({ clientId, email: cleanEmail, portalRole: "owner" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Invitation could not be sent.");
      setSuccessMessage(`Portal invitation sent to ${body.email}. The customer will choose their own password.`);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Invitation could not be sent.");
    } finally {
      setIsWorking(false);
    }
  }

  async function accessAction(item: PortalAccess, action: "resend" | "disable" | "enable") {
    setErrorMessage("");
    setSuccessMessage("");
    setIsWorking(true);
    try {
      const response = await authFetch("/api/admin/client-access", {
        method: "PATCH",
        body: JSON.stringify({ clientId, profileId: item.profile_id, action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Portal access could not be updated.");
      if (action === "resend") setSuccessMessage(`Password/setup email sent to ${body.email}.`);
      if (action === "disable") setSuccessMessage("Client portal access disabled.");
      if (action === "enable") setSuccessMessage("Client portal access enabled.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Portal access could not be updated.");
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-8 font-bold text-gray-500 shadow-sm">Loading customer...</div>;
  }

  if (!customer) {
    return <div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700">{errorMessage || "Customer not found."}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/customers" className="text-sm font-black text-bakerssPink transition hover:opacity-70">← Back to Customers</Link>
        <h1 className="mt-3 text-3xl font-black">{customer.client_name}</h1>
        <p className="mt-1 text-gray-600">Customer details and client portal access.</p>
      </div>

      {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{successMessage}</div>}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Customer Information</h2>
        <form onSubmit={saveCustomer} className="mt-5 space-y-5">
          <div>
            <label htmlFor="customer-name" className="mb-2 block text-sm font-black">Customer Name</label>
            <input id="customer-name" value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100" />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="customer-email" className="mb-2 block text-sm font-black">Email</label>
              <input id="customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100" />
            </div>
            <div>
              <label htmlFor="customer-phone" className="mb-2 block text-sm font-black">Phone</label>
              <input id="customer-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={isSaving} className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50">{isSaving ? "Saving..." : "Save Changes"}</button>
            <Link href={`/properties?clientId=${customer.id}`} className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-black transition hover:bg-gray-50">View Properties</Link>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-bakerssPink">Client Portal</p>
            <h2 className="mt-1 text-xl font-black">Portal Access</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">Invite a real customer without creating their password. Bakerss OS emails the customer a secure setup link so they choose their own password. They can use Forgot Password later at any time.</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-2 text-xs font-black uppercase ${access.some((item) => item.is_active) ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
            {access.some((item) => item.is_active) ? "Active" : access.length ? "Disabled" : "Not Activated"}
          </span>
        </div>

        {access.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed bg-gray-50 p-5">
            <label htmlFor="portal-email" className="mb-2 block text-sm font-black">Portal Login Email</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input id="portal-email" type="email" value={portalEmail} onChange={(event) => setPortalEmail(event.target.value)} placeholder="customer@example.com" className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100" />
              <button type="button" onClick={inviteClient} disabled={isWorking} className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50">{isWorking ? "Sending..." : "Send Portal Invitation"}</button>
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">The invitation creates the client login, links it to this customer, and assigns Owner portal access. No password is stored or chosen by Bakerss.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {access.map((item) => (
              <div key={item.id} className="rounded-xl border p-4">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <p className="font-black text-gray-950">{item.profile?.full_name || customer.client_name}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-600">{item.profile?.email || "No email"}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500">Role: {item.portal_role} · Status: {item.is_active ? "Active" : "Disabled"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => accessAction(item, "resend")} disabled={isWorking} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-black transition hover:bg-gray-50 disabled:opacity-50">Send Password/Setup Email</button>
                    {item.is_active ? (
                      <button type="button" onClick={() => accessAction(item, "disable")} disabled={isWorking} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50">Disable Access</button>
                    ) : (
                      <button type="button" onClick={() => accessAction(item, "enable")} disabled={isWorking} className="rounded-xl border border-green-200 px-4 py-2 text-sm font-black text-green-700 transition hover:bg-green-50 disabled:opacity-50">Enable Access</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
