"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage("Enter your email address.");
      return;
    }

    setIsSending(true);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    setIsSending(false);

    if (error) {
      const message = error.message || "Password reset email could not be sent.";
      if (/rate|security purposes|seconds|email rate/i.test(message)) {
        setErrorMessage(
          "Password email limit reached. Wait and try again, or ask your administrator to check the Supabase Auth email configuration.",
        );
      } else {
        setErrorMessage(message);
      }
      return;
    }

    setSuccessMessage(
      "Password reset email sent. Open the email and use the link to choose a new password.",
    );
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bakerssPink text-2xl font-black text-white">
              B
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-bakerssPink">
              Bakerss Property Services
            </p>
            <h1 className="mt-2 text-3xl font-black text-gray-950">Reset Password</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Enter the email address connected to your Bakerss OS login.
            </p>
          </div>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          {successMessage && !errorMessage && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-black text-gray-800">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={isSending}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full rounded-xl bg-bakerssPink px-5 py-3 text-base font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? "Sending..." : "Send Reset Email"}
            </button>
          </form>

          <div className="mt-6 border-t pt-5 text-center">
            <Link href="/login" className="text-sm font-black text-gray-600 transition hover:text-bakerssPink">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
