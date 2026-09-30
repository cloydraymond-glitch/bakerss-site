"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get("error_description") || params.get("error");
      if (urlError && mounted) {
        setErrorMessage(decodeURIComponent(urlError.replace(/\+/g, " ")));
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session?.user) {
        setHasRecoverySession(true);
      }
      if (mounted) setIsChecking(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session?.user) {
        setHasRecoverySession(true);
        setErrorMessage("");
        setIsChecking(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!hasRecoverySession) {
      setErrorMessage("This reset link is invalid or expired. Request a new password reset email.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Password updated successfully. You can now sign in with your new password.");
    setPassword("");
    setConfirmPassword("");

    await supabase.auth.signOut();
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
            <h1 className="mt-2 text-3xl font-black text-gray-950">Choose New Password</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Set a new password for your Bakerss OS account.
            </p>
          </div>

          {isChecking && (
            <div className="mt-6 rounded-xl border bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
              Checking reset link...
            </div>
          )}

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
              {successMessage}
            </div>
          )}

          {!successMessage && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-black text-gray-800">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSaving || isChecking || !hasRecoverySession}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="mb-2 block text-sm font-black text-gray-800">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSaving || isChecking || !hasRecoverySession}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSaving || isChecking || !hasRecoverySession}
                className="w-full rounded-xl bg-bakerssPink px-5 py-3 text-base font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}

          <div className="mt-6 border-t pt-5 text-center">
            {successMessage ? (
              <Link href="/login" className="text-sm font-black text-bakerssPink transition hover:opacity-80">
                Go to Login
              </Link>
            ) : (
              <Link href="/forgot-password" className="text-sm font-black text-gray-600 transition hover:text-bakerssPink">
                Request a New Reset Link
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
