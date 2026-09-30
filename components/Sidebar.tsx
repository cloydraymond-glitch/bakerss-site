"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Repeat2,
  Route,
  ShieldCheck,
  Settings,
  UserRoundCog,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase/client";

type SidebarProps = {
  profileName?: string | null;
  role?: string | null;
};

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/operations", label: "Operations", icon: Route },
  { href: "/operations/pilot-qa", label: "Pilot QA", icon: ShieldCheck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/properties", label: "Properties", icon: Home },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
  { href: "/employees", label: "Employees", icon: UserRoundCog },
  { href: "/services", label: "Services", icon: Wrench },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/dispatch", label: "Dispatch", icon: Route },
  { href: "/technician", label: "Technician", icon: UserRoundCog },
  { href: "/recurring", label: "Recurring", icon: Repeat2 },
  { href: "/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/timeclock", label: "Timeclock", icon: Clock3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ profileName, role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const navLinks = (
    <nav className="space-y-2">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              active
                ? "bg-bakerssGray text-black"
                : "text-gray-700 hover:bg-bakerssGray hover:text-black"
            }`}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-50 border-b bg-white lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-black leading-tight">Bakerss OS</p>
            <p className="text-xs text-gray-500">{profileName || "Operations"}</p>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            className="rounded-xl border p-2.5 text-gray-800"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="max-h-[75vh] overflow-y-auto border-t bg-white p-4 shadow-lg">
            {navLinks}
            <button
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              className="mt-4 flex w-full items-center gap-3 rounded-xl border border-red-200 px-4 py-3 text-left text-sm font-black text-red-700 disabled:opacity-60"
            >
              <LogOut size={18} />
              {isSigningOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        )}
      </div>

      <aside className="hidden min-h-screen w-72 shrink-0 border-r bg-white p-5 lg:flex lg:flex-col">
        <div className="mb-8">
          <div className="text-2xl font-black tracking-tight">Bakerss OS</div>
          <div className="text-sm text-gray-500">Operations Platform v1.0</div>

          {(profileName || role) && (
            <div className="mt-4 rounded-xl bg-gray-50 p-3">
              {profileName && <p className="text-sm font-black text-gray-900">{profileName}</p>}
              {role && (
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                  {role}
                </p>
              )}
            </div>
          )}
        </div>

        {navLinks}

        <button
          type="button"
          onClick={signOut}
          disabled={isSigningOut}
          className="mt-auto flex w-full items-center gap-3 rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        >
          <LogOut size={18} />
          {isSigningOut ? "Signing Out..." : "Sign Out"}
        </button>
      </aside>
    </>
  );
}
