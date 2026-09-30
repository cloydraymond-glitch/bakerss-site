"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { supabase } from "../lib/supabase/client";
import {
  isAdminRole,
  isClientPortalRoute,
  isClientRole,
  isEmployeeRole,
  isPublicRoute,
  isTechnicianRoute,
  landingPathForRole,
  normalizeRole,
} from "../lib/access";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type AuthState = "checking" | "authorized" | "unauthorized" | "public";

export default function AuthenticatedShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function verifyAccess() {
      setErrorMessage("");

      if (isPublicRoute(pathname)) {
        if (isMounted) {
          setProfile(null);
          setAuthState("public");
        }
        return;
      }

      if (isMounted) setAuthState("checking");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (sessionError || !session?.user) {
        setProfile(null);
        setAuthState("unauthorized");
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError || !profileData) {
        setProfile(null);
        setAuthState("unauthorized");
        setErrorMessage(
          profileError
            ? `Your profile could not be loaded: ${profileError.message}`
            : "No profile is connected to this login.",
        );
        return;
      }

      const loadedProfile = profileData as Profile;
      const role = normalizeRole(loadedProfile.role);
      setProfile(loadedProfile);

      if (role === "unknown") {
        setAuthState("unauthorized");
        setErrorMessage(
          `Your account role "${loadedProfile.role || "not assigned"}" does not have access to Bakerss OS.`,
        );
        return;
      }

      // Client portal is client-only. Admin users use the operations/admin views.
      // This keeps the portal data boundary explicit and avoids accidental cross-client viewing.
      if (isClientPortalRoute(pathname)) {
        if (isClientRole(role)) {
          setAuthState("authorized");
          return;
        }

        setAuthState("unauthorized");
        router.replace(landingPathForRole(role));
        return;
      }

      // Technician routes are available to field staff and admins/managers for support/testing.
      if (isTechnicianRoute(pathname)) {
        if (isAdminRole(role) || isEmployeeRole(role)) {
          setAuthState("authorized");
          return;
        }

        setAuthState("unauthorized");
        router.replace(landingPathForRole(role));
        return;
      }

      // Everything else is an admin/operations route.
      if (isAdminRole(role)) {
        setAuthState("authorized");
        return;
      }

      setAuthState("unauthorized");
      router.replace(landingPathForRole(role));
    }

    void verifyAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        if (!isPublicRoute(pathname)) router.replace("/login");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="font-black">Checking access...</p>
        </div>
      </div>
    );
  }

  if (authState === "public") return <>{children}</>;

  if (authState === "unauthorized") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-black text-red-800">Access Restricted</h1>
          <p className="mt-3 text-sm leading-6 text-red-700">
            {errorMessage || "Redirecting you to an authorized area..."}
          </p>
        </div>
      </div>
    );
  }

  const role = normalizeRole(profile?.role);
  const showAdminSidebar = isAdminRole(role);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {showAdminSidebar && (
        <Sidebar profileName={profile?.full_name} role={role} />
      )}

      <main className={showAdminSidebar ? "w-full p-4 sm:p-5 lg:p-8" : "w-full p-4 sm:p-6"}>
        {children}
      </main>
    </div>
  );
}
