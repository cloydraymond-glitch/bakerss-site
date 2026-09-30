"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { landingPathForRole, normalizeRole } from "../../lib/access";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsCheckingSession(false);
        return;
      }

      await redirectUser(session.user.id);
    }

    void checkExistingSession();
  }, []);

  async function redirectUser(userId: string) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        role
      `)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setErrorMessage(
        `You are signed in, but your profile could not be loaded: ${error.message}`,
      );
      setIsCheckingSession(false);
      setIsSigningIn(false);
      return;
    }

    if (!profile) {
      setErrorMessage(
        "Your login exists, but no matching profile was found. An administrator must create or repair your profile.",
      );
      setIsCheckingSession(false);
      setIsSigningIn(false);
      return;
    }

    const typedProfile = profile as Profile;
    const role = normalizeRole(typedProfile.role);

    if (role !== "unknown") {
      router.replace(landingPathForRole(role));
      router.refresh();
      return;
    }

    setErrorMessage(
      `Your account role is "${typedProfile.role || "not assigned"}". An administrator must assign an authorized role before you can continue.`,
    );

    await supabase.auth.signOut();

    setIsCheckingSession(false);
    setIsSigningIn(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setStatusMessage("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Enter your email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Enter your password.");
      return;
    }

    setIsSigningIn(true);
    setStatusMessage("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setStatusMessage("");
      setIsSigningIn(false);
      return;
    }

    if (!data.user) {
      setErrorMessage("Login failed. No user account was returned.");
      setStatusMessage("");
      setIsSigningIn(false);
      return;
    }

    setStatusMessage("Login successful. Loading your account...");
    await redirectUser(data.user.id);
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="font-black">Checking your session...</p>
        </div>
      </div>
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

            <h1 className="mt-2 text-3xl font-black text-gray-950">
              Account Login
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Sign in to access your Bakerss account.
            </p>
          </div>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          {statusMessage && !errorMessage && (
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
              {statusMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-black text-gray-800"
              >
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
                disabled={isSigningIn}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-black text-gray-800"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                disabled={isSigningIn}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full rounded-xl bg-bakerssPink px-5 py-3 text-base font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningIn ? "Signing In..." : "Sign In"}
            </button>

            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-black text-bakerssPink transition hover:opacity-80"
              >
                Forgot password?
              </Link>
            </div>
          </form>

          <div className="mt-6 border-t pt-5 text-center">
            <p className="text-xs leading-5 text-gray-500">
              Employee and client accounts are created and connected by an administrator.
            </p>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/"
            className="text-sm font-black text-gray-600 transition hover:text-bakerssPink"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}