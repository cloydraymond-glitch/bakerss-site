"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase/client";

type Entry = {
  entry_id: string;
  work_date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  recorded_seconds: number;
  running_seconds: number;
  approved: boolean;
  entry_status: string | null;
  clock_in_note: string | null;
  clock_out_note: string | null;
};
const zone = "America/New_York";
const button = "rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50";
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function currentSunday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
}
function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}
function timeLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(date));
}
function hours(seconds: number) { return (seconds / 3600).toFixed(2); }

export default function MyTimesheetsPage() {
  const router = useRouter();
  const [week, setWeek] = useState(currentSunday);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(""); setEntries([]); setUpdated("");
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        if (!session) { router.replace("/login"); return; }
        const { data: employee, error: employeeError } = await supabase.from("employees").select("full_name").eq("profile_id", session.user.id).maybeSingle();
        if (employeeError) throw employeeError;
        const { data, error: queryError } = await supabase.rpc("get_my_weekly_timesheet", { p_week_start: week });
        if (queryError) throw queryError;
        if (!cancelled) {
          setName(employee?.full_name || "Your timesheet");
          setEntries((data || []) as Entry[]);
          setUpdated(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date()));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : (cause as { message?: string })?.message || "Your timesheet could not be loaded. Please refresh or contact your manager.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [week, refresh, router]);
  const recorded = entries.reduce((sum, e) => sum + Number(e.recorded_seconds), 0);
  const running = entries.reduce((sum, e) => sum + Number(e.running_seconds), 0);
  const approved = entries.reduce((sum, e) => sum + (e.approved ? Number(e.recorded_seconds) : 0), 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const currentWeek = currentSunday();

  return <div className="mx-auto max-w-3xl space-y-4 pb-24">
    <header className="rounded-2xl border bg-white p-5 shadow-sm">
      <Link href="/technician" className="text-sm font-bold text-bakerssPink">← Technician Home</Link>
      <h1 className="mt-3 text-3xl font-black">My Weekly Timesheet</h1>
      <p className="mt-1 text-sm text-gray-600">{name} · Sunday–Saturday · Eastern time</p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button className={button} onClick={() => setWeek(addDays(week, -7))}>Previous week</button>
        <label className="text-sm font-bold">Week starting
          <input type="date" value={week} max={currentWeek} className="mt-1 block rounded-xl border p-2" onChange={e => {
            if (!e.target.value) return;
            const value = e.target.value;
            setWeek(addDays(value, -new Date(`${value}T12:00:00Z`).getUTCDay()));
          }} />
        </label>
        <button className={button} disabled={week >= currentWeek} onClick={() => setWeek(addDays(week, 7))}>Next week</button>
        <button className={button} onClick={() => setWeek(currentWeek)}>This week</button>
        <button className={button} disabled={loading} onClick={() => setRefresh(v => v + 1)}>Refresh</button>
      </div>
      <p className="mt-3 text-sm">{dayLabel(week)} – {dayLabel(addDays(week, 6))}, {week.slice(0, 4)}</p>
    </header>
    {loading ? <p role="status" className="rounded-xl border bg-white p-5">Loading your hours…</p> : error ?
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Recorded hours", hours(recorded)], ["Approved hours", hours(approved)], ["Running shift hours", hours(running)]].map(([label, value]) =>
          <div key={label} className="rounded-2xl border bg-white p-4"><p className="text-sm text-gray-600">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>)}
      </div>
      <p className="text-sm text-gray-600">Recorded hours use completed daily shifts. Job timers are excluded. Running shifts are provisional, as of {updated} ET; refresh to update. These are recorded hours, not a pay statement. Contact your manager about missing punches or corrections.</p>
      {!entries.length && <p className="rounded-xl border bg-white p-4">No recorded shifts for this week.</p>}
      {days.map(day => {
        const rows = entries.filter(e => e.work_date === day);
        const total = rows.reduce((sum, e) => sum + Number(e.recorded_seconds), 0);
        return <section key={day} className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="font-black">{dayLabel(day)}</h2><p className="font-bold">{hours(total)} hrs recorded</p></div>
          {!rows.length ? <p className="mt-2 text-sm text-gray-500">No hours recorded.</p> : rows.map(entry => <div key={`${day}-${entry.entry_id}`} className="mt-3 rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><p>{timeLabel(entry.clock_in_time)} → {entry.clock_out_time ? timeLabel(entry.clock_out_time) : "Still clocked in"}</p><p className="font-bold">{entry.clock_out_time ? `${hours(Number(entry.recorded_seconds))} hrs` : `${hours(Number(entry.running_seconds))} hrs running`}</p></div>
            <p className="mt-1 text-gray-600">{!entry.clock_out_time ? "Open shift · provisional" : entry.approved ? "Approved" : "Awaiting approval"}{entry.entry_status === "adjusted" ? " · Adjusted" : ""}</p>
            {entry.clock_in_note && <p className="mt-1 whitespace-pre-wrap">Clock-in note: {entry.clock_in_note}</p>}
            {entry.clock_out_note && <p className="mt-1 whitespace-pre-wrap">Clock-out note: {entry.clock_out_note}</p>}
          </div>)}
        </section>;
      })}
      <p className="text-xs text-gray-500">Shifts spanning midnight or a week boundary are split between the days worked. Displayed hours are rounded to two decimals; totals use the unrounded durations.</p>
    </>}
  </div>;
}
