"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type Employee = {
  id: string;
  profile_id: string | null;
  full_name: string;
  employment_status: string | null;
};

type TechnicianJob = {
  id: string;
  job_title: string;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  description: string | null;
  assigned_employee_id: string | null;
  property_id: string | null;
  estimated_duration_minutes: number | null;

  clients: {
    client_name: string;
  } | null;

  properties: {
    property_name: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  } | null;

  services: {
    service_name: string;
  } | null;

  employees: {
    full_name: string;
  } | null;
};

type TimeclockEntry = {
  id: string;
  employee_id: string | null;
  profile_id: string | null;
  job_id: string | null;
  parent_shift_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
  clock_in_note: string | null;
  clock_out_note: string | null;
  status: "open" | "closed" | "adjusted" | null;
  created_at: string;
};

type DispatchAssignment = {
  id: string;
  job_id: string;
  employee_id: string;
  assignment_status: string;
  assigned_at: string;
  acknowledged_at: string | null;
  started_at: string | null;
  escalated_at: string | null;
  closed_at: string | null;
};

type TravelLeg = {
  originJobId: string;
  destinationJobId: string;
  travelMinutes: number;
  distanceMiles: number;
};

export default function TechnicianPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<TechnicianJob[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [openShift, setOpenShift] = useState<TimeclockEntry | null>(null);
  const [openJobTimer, setOpenJobTimer] = useState<TimeclockEntry | null>(null);
  const [shiftElapsedSeconds, setShiftElapsedSeconds] = useState(0);
  const [clockNote, setClockNote] = useState("");

  const [travelLegs, setTravelLegs] = useState<TravelLeg[]>([]);
  const [isCalculatingTravel, setIsCalculatingTravel] = useState(false);

  const [dispatchAssignments, setDispatchAssignments] =
    useState<DispatchAssignment[]>([]);
  const [acknowledgingJobId, setAcknowledgingJobId] =
    useState<string | null>(null);

  const [unreadDispatchChanges, setUnreadDispatchChanges] = useState(0);
  const [dispatchNotice, setDispatchNotice] = useState("");
  const [latestDispatchUpdate, setLatestDispatchUpdate] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");

  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUpdatingClock, setIsUpdatingClock] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setIsLoading(false);
      router.replace("/login");
      return;
    }

    const user = session.user;

    const { data: employeeData, error: employeeError } = await supabase
      .from("employees")
      .select(`
        id,
        profile_id,
        full_name,
        employment_status
      `)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (employeeError) {
      setErrorMessage(
        `Your employee record could not be loaded: ${employeeError.message}`,
      );
      setIsLoading(false);
      return;
    }

    if (!employeeData) {
      setErrorMessage(
        "Your login is valid, but it is not connected to an employee record. An administrator must connect your profile to an employee.",
      );
      setIsLoading(false);
      return;
    }

    const typedEmployee = employeeData as Employee;

    if (
      typedEmployee.employment_status &&
      typedEmployee.employment_status !== "active"
    ) {
      setEmployee(typedEmployee);
      setErrorMessage(
        "This employee account is not active. Contact an administrator.",
      );
      setIsLoading(false);
      return;
    }

    setEmployee(typedEmployee);

    const [
      jobsResponse,
      openShiftResponse,
      openJobResponse,
      dispatchAssignmentsResponse,
    ] = await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            job_title,
            job_status,
            priority,
            scheduled_start,
            description,
            assigned_employee_id,
            property_id,
            estimated_duration_minutes,
            clients ( client_name ),
            properties (
              property_name,
              street_address,
              city,
              state,
              zip_code
            ),
            services ( service_name ),
            employees ( full_name )
          `)
          .eq("assigned_employee_id", typedEmployee.id)
          .not("job_status", "in", '("completed","cancelled")')
          .order("scheduled_start", {
            ascending: true,
            nullsFirst: false,
          }),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            employee_id,
            profile_id,
            job_id,
            parent_shift_id,
            entry_type,
            activity_type,
            clock_in_time,
            clock_out_time,
            clock_in_note,
            clock_out_note,
            status,
            created_at
          `)
          .eq("employee_id", typedEmployee.id)
          .eq("entry_type", "shift")
          .is("clock_out_time", null)
          .maybeSingle(),

        supabase
          .from("employee_timeclock")
          .select(`
            id,
            employee_id,
            profile_id,
            job_id,
            parent_shift_id,
            entry_type,
            activity_type,
            clock_in_time,
            clock_out_time,
            clock_in_note,
            clock_out_note,
            status,
            created_at
          `)
          .eq("employee_id", typedEmployee.id)
          .eq("entry_type", "job")
          .is("clock_out_time", null)
          .maybeSingle(),

        supabase
          .from("dispatch_assignments")
          .select(`
            id,
            job_id,
            employee_id,
            assignment_status,
            assigned_at,
            acknowledged_at,
            started_at,
            escalated_at,
            closed_at
          `)
          .eq("employee_id", typedEmployee.id)
          .is("closed_at", null),
      ]);

    const firstError =
      jobsResponse.error ||
      openShiftResponse.error ||
      openJobResponse.error ||
      dispatchAssignmentsResponse.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    setJobs((jobsResponse.data ?? []) as unknown as TechnicianJob[]);
    setOpenShift(
      (openShiftResponse.data as TimeclockEntry | null) ?? null,
    );
    setOpenJobTimer(
      (openJobResponse.data as TimeclockEntry | null) ?? null,
    );
    setDispatchAssignments(
      (dispatchAssignmentsResponse.data ?? []) as DispatchAssignment[],
    );

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [loadPage, router]);

  useEffect(() => {
    if (!employee?.id) {
      return;
    }

    setRealtimeStatus("connecting");

    const channel = supabase
      .channel(`technician-jobs-${employee.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        (payload) => {
          const newRow = (payload.new ?? {}) as {
            assigned_employee_id?: string | null;
            job_title?: string | null;
            scheduled_start?: string | null;
            job_status?: string | null;
            priority?: string | null;
          };

          const oldRow = (payload.old ?? {}) as {
            assigned_employee_id?: string | null;
            job_title?: string | null;
            scheduled_start?: string | null;
            job_status?: string | null;
            priority?: string | null;
          };

          const involvesTechnician =
            newRow.assigned_employee_id === employee.id ||
            oldRow.assigned_employee_id === employee.id;

          if (!involvesTechnician) {
            return;
          }

          let message = "Your assigned jobs were updated.";

          if (payload.eventType === "INSERT") {
            const priority = String(newRow.priority ?? "").toLowerCase();

            if (priority === "urgent") {
              message = newRow.job_title
                ? `URGENT assignment: ${newRow.job_title}`
                : "URGENT job assigned to you.";
            } else if (priority === "high") {
              message = newRow.job_title
                ? `High-priority assignment: ${newRow.job_title}`
                : "A high-priority job was assigned to you.";
            } else {
              message = newRow.job_title
                ? `New assignment: ${newRow.job_title}`
                : "A new job was assigned to you.";
            }
          } else if (payload.eventType === "DELETE") {
            message = oldRow.job_title
              ? `Assignment removed: ${oldRow.job_title}`
              : "A job was removed from your assignments.";
          } else if (payload.eventType === "UPDATE") {
            const reassignedAway =
              oldRow.assigned_employee_id === employee.id &&
              newRow.assigned_employee_id !== employee.id;

            if (reassignedAway) {
              message = oldRow.job_title
                ? `Assignment removed: ${oldRow.job_title}`
                : "A job was reassigned.";
            } else if (
              oldRow.scheduled_start !== newRow.scheduled_start &&
              newRow.job_title
            ) {
              message = `Schedule changed: ${newRow.job_title}`;
            } else if (
              oldRow.job_status !== newRow.job_status &&
              newRow.job_title
            ) {
              message = `Status changed: ${newRow.job_title}`;
            } else if (newRow.job_title) {
              message = `Assignment updated: ${newRow.job_title}`;
            }
          }

          setDispatchNotice(message);
          setUnreadDispatchChanges((count) => count + 1);
          setLatestDispatchUpdate(new Date().toISOString());
          setTravelLegs([]);
          void loadPage();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setRealtimeStatus("error");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [employee?.id, loadPage]);

  useEffect(() => {
    if (!openShift?.clock_in_time) {
      setShiftElapsedSeconds(0);
      return;
    }

    function updateElapsed() {
      const start = new Date(openShift?.clock_in_time ?? "").getTime();

      if (Number.isNaN(start)) {
        setShiftElapsedSeconds(0);
        return;
      }

      setShiftElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - start) / 1000)),
      );
    }

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [openShift]);

  const activeJob = useMemo(() => {
    if (!openJobTimer?.job_id) return null;

    return jobs.find((job) => job.id === openJobTimer.job_id) ?? null;
  }, [jobs, openJobTimer]);

  const todayJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (!job.scheduled_start) return false;

        const scheduled = new Date(job.scheduled_start);
        const now = new Date();

        return (
          scheduled.getFullYear() === now.getFullYear() &&
          scheduled.getMonth() === now.getMonth() &&
          scheduled.getDate() === now.getDate()
        );
      }),
    [jobs],
  );

  const orderedTodayJobs = useMemo(
    () =>
      [...todayJobs].sort((a, b) => {
        const aTime = a.scheduled_start
          ? new Date(a.scheduled_start).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduled_start
          ? new Date(b.scheduled_start).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }),
    [todayJobs],
  );

  const urgentJobs = useMemo(
    () =>
      jobs.filter(
        (job) => (job.priority ?? "").toLowerCase() === "urgent",
      ),
    [jobs],
  );

  const highPriorityJobs = useMemo(
    () =>
      jobs.filter(
        (job) => (job.priority ?? "").toLowerCase() === "high",
      ),
    [jobs],
  );

  const scheduledSoonJobs = useMemo(() => {
    const now = Date.now();
    const soonWindow = now + 60 * 60 * 1000;

    return jobs.filter((job) => {
      if (!job.scheduled_start) return false;

      const scheduled = new Date(job.scheduled_start).getTime();

      return (
        !Number.isNaN(scheduled) &&
        scheduled >= now &&
        scheduled <= soonWindow
      );
    });
  }, [jobs]);

  const overdueJobs = useMemo(() => {
    const now = Date.now();

    return jobs.filter((job) => {
      if (!job.scheduled_start) return false;

      const scheduled = new Date(job.scheduled_start).getTime();

      return (
        !Number.isNaN(scheduled) &&
        scheduled < now &&
        job.job_status !== "in_progress" &&
        job.job_status !== "completion_requested"
      );
    });
  }, [jobs]);

  const nextJob = useMemo(() => {
    const now = Date.now();

    return (
      orderedTodayJobs.find((job) => {
        if (!job.scheduled_start) return false;
        const scheduled = new Date(job.scheduled_start).getTime();
        return !Number.isNaN(scheduled) && scheduled >= now;
      }) ??
      jobs.find((job) => {
        if (!job.scheduled_start) return false;
        const scheduled = new Date(job.scheduled_start).getTime();
        return !Number.isNaN(scheduled) && scheduled >= now;
      }) ??
      null
    );
  }, [jobs, orderedTodayJobs]);

  const travelLegMap = useMemo(
    () =>
      new Map(
        travelLegs.map((leg) => [
          `${leg.originJobId}:${leg.destinationJobId}`,
          leg,
        ]),
      ),
    [travelLegs],
  );

  function getDispatchAssignment(jobId: string) {
    return (
      dispatchAssignments.find(
        (assignment) => assignment.job_id === jobId,
      ) ?? null
    );
  }

  async function acknowledgeAssignment(jobId: string) {
    const assignment = getDispatchAssignment(jobId);

    if (!assignment) {
      setErrorMessage(
        "No active dispatch assignment was found for this job.",
      );
      return;
    }

    if (assignment.acknowledged_at) {
      return;
    }

    setAcknowledgingJobId(jobId);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc(
      "acknowledge_dispatch_assignment",
      {
        p_job_id: jobId,
      },
    );

    if (error) {
      setErrorMessage(error.message);
      setAcknowledgingJobId(null);
      return;
    }

    setSuccessMessage("Assignment acknowledged.");
    setAcknowledgingJobId(null);
    await loadPage();
  }

  async function calculateTodayTravel() {
    if (isCalculatingTravel || orderedTodayJobs.length < 2) return;

    setIsCalculatingTravel(true);
    setErrorMessage("");

    const calculated: TravelLeg[] = [];

    try {
      for (let index = 0; index < orderedTodayJobs.length - 1; index += 1) {
        const origin = orderedTodayJobs[index];
        const destination = orderedTodayJobs[index + 1];

        if (!origin.property_id || !destination.property_id) {
          continue;
        }

        const response = await fetch("/api/travel-time", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            originPropertyId: origin.property_id,
            destinationPropertyId: destination.property_id,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          continue;
        }

        calculated.push({
          originJobId: origin.id,
          destinationJobId: destination.id,
          travelMinutes: Number(payload.travelMinutes ?? 0),
          distanceMiles: Number(payload.distanceMiles ?? 0),
        });

        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }

      setTravelLegs(calculated);
      setSuccessMessage(
        calculated.length > 0
          ? "Today's travel times are ready."
          : "No travel legs could be calculated for today's route.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to calculate today's travel times.",
      );
    } finally {
      setIsCalculatingTravel(false);
    }
  }

  async function handleClockInForDay(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isUpdatingClock || openShift) return;

    setIsUpdatingClock(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("clock_in_for_day", {
      p_note: clockNote.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsUpdatingClock(false);
      return;
    }

    setClockNote("");
    setSuccessMessage("You are clocked in for the day.");
    setIsUpdatingClock(false);
    await loadPage();
  }

  async function handleClockOutForDay(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isUpdatingClock || !openShift) return;

    const confirmed = window.confirm(
      openJobTimer
        ? "Clocking out for the day will also stop your active job timer. Continue?"
        : "Clock out for the day?",
    );

    if (!confirmed) return;

    setIsUpdatingClock(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("clock_out_for_day", {
      p_note: clockNote.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsUpdatingClock(false);
      return;
    }

    setClockNote("");
    setSuccessMessage("You are clocked out for the day.");
    setIsUpdatingClock(false);
    await loadPage();
  }

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      setIsSigningOut(false);
      return;
    }

    router.replace("/login");
  }

  function formatStatus(status: string | null) {
    if (!status) return "New";

    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatDate(value: string | null) {
    if (!value) return "Not scheduled";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Invalid date";

    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatRelativeUpdate(value: string | null) {
    if (!value) return "No live updates yet";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Update received";
    }

    return `Last dispatch update ${new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  }

  function formatTime(value: string | null) {
    if (!value) return "No time";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "No time";

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatEstimatedDuration(minutes: number | null) {
    if (!minutes || minutes <= 0) return "Duration not set";

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours === 0) return `${remainder} min`;
    if (remainder === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;

    return `${hours}h ${remainder}m`;
  }

  function getPropertyAddress(job: TechnicianJob) {
    return [
      job.properties?.street_address,
      job.properties?.city,
      job.properties?.state,
      job.properties?.zip_code,
    ]
      .filter(Boolean)
      .join(", ");
  }

  function getStatusClasses(status: string | null) {
    switch (status) {
      case "in_progress":
        return "bg-blue-50 text-blue-700";
      case "waiting_on_materials":
        return "bg-amber-50 text-amber-700";
      case "scheduled":
        return "bg-green-50 text-green-700";
      case "needs_follow_up":
        return "bg-purple-50 text-purple-700";
      case "new":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  function getPriorityClasses(priority: string | null) {
    switch (priority) {
      case "urgent":
        return "bg-red-50 text-red-700";
      case "high":
        return "bg-pink-50 text-bakerssPink";
      case "low":
        return "bg-gray-100 text-gray-600";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  function openMaps(job: TechnicianJob) {
    const address = getPropertyAddress(job);
    if (!address) return;

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        address,
      )}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function getTimingRisk(
    origin: TechnicianJob,
    destination: TechnicianJob,
    travelMinutes: number,
  ) {
    if (!origin.scheduled_start || !destination.scheduled_start) return null;

    const originStart = new Date(origin.scheduled_start).getTime();
    const destinationStart = new Date(destination.scheduled_start).getTime();

    if (
      Number.isNaN(originStart) ||
      Number.isNaN(destinationStart)
    ) {
      return null;
    }

    const durationMinutes = origin.estimated_duration_minutes ?? 0;
    const projectedOriginEnd =
      originStart + durationMinutes * 60_000;
    const availableMinutes = Math.floor(
      (destinationStart - projectedOriginEnd) / 60_000,
    );

    if (availableMinutes < travelMinutes) {
      return {
        risk: true,
        message: `${travelMinutes - availableMinutes} min short`,
      };
    }

    return {
      risk: false,
      message: `${availableMinutes - travelMinutes} min buffer`,
    };
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">Loading your assigned jobs...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24 sm:space-y-6 sm:pb-10">
      <header className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-bakerssPink">
              Field Operations
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              Technician Home
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {employee
                ? `Signed in as ${employee.full_name}.`
                : "View your assigned work orders."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-800 disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm"
          >
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </button>
        </div>

        <Link
          href="/technician/timesheets"
          className="mt-4 block rounded-xl border border-bakerssPink bg-white px-4 py-3 text-center text-sm font-black text-bakerssPink"
        >
          My Weekly Timesheet
        </Link>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            href="/technician/create-work-order"
            className="rounded-xl bg-bakerssPink px-4 py-3 text-center text-sm font-black text-white shadow-sm transition hover:opacity-90"
          >
            + Create Work Order
          </Link>
          <button
            type="button"
            onClick={() => void loadPage()}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-50"
          >
            Refresh Assignments
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-2xl font-black">{jobs.length}</p>
            <p className="text-xs font-black uppercase text-gray-500">
              Active
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-2xl font-black">{todayJobs.length}</p>
            <p className="text-xs font-black uppercase text-gray-500">
              Today
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-2xl font-black">
              {openJobTimer ? "1" : "0"}
            </p>
            <p className="text-xs font-black uppercase text-gray-500">
              Running
            </p>
          </div>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {successMessage}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">
              Live Dispatch
            </p>
            <h2 className="mt-1 text-lg font-black">
              Assignment Updates
            </h2>
            <p className="mt-1 text-xs font-bold text-gray-500">
              {formatRelativeUpdate(latestDispatchUpdate)}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-xs font-black uppercase ${
              realtimeStatus === "connected"
                ? "bg-green-100 text-green-800"
                : realtimeStatus === "error"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {realtimeStatus === "connected"
              ? "Live"
              : realtimeStatus === "error"
                ? "Offline"
                : "Connecting"}
          </span>
        </div>

        {dispatchNotice ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-blue-950">
                  {dispatchNotice}
                </p>
                <p className="mt-1 text-sm text-blue-800">
                  Your job list and route were refreshed automatically.
                </p>
              </div>

              {unreadDispatchChanges > 0 && (
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-blue-700 px-2 text-xs font-black text-white">
                  {unreadDispatchChanges}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setUnreadDispatchChanges(0);
                setDispatchNotice("");
              }}
              className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-900"
            >
              Mark Seen
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            New assignments and dispatch changes will refresh this screen automatically.
          </p>
        )}
      </section>

      {(urgentJobs.length > 0 ||
        highPriorityJobs.length > 0 ||
        overdueJobs.length > 0 ||
        scheduledSoonJobs.length > 0) && (
        <section className="space-y-3">
          {urgentJobs.length > 0 && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
                    Urgent Work
                  </p>
                  <h2 className="mt-1 text-xl font-black text-red-950">
                    {urgentJobs.length} urgent assignment
                    {urgentJobs.length === 1 ? "" : "s"}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-red-800">
                    Review these jobs before normal-priority work.
                  </p>
                </div>
                <span className="rounded-full bg-red-700 px-3 py-2 text-xs font-black uppercase text-white">
                  Urgent
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {urgentJobs.slice(0, 3).map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl bg-white p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-black text-red-950">
                          {job.job_title}
                        </span>
                        <span className="mt-1 block text-xs font-bold text-red-700">
                          {formatDate(job.scheduled_start)}
                        </span>
                      </span>

                      <Link
                        href={`/technician/jobs/${job.id}`}
                        className="shrink-0 font-black text-red-800"
                      >
                        Open →
                      </Link>
                    </div>

                    {(() => {
                      const assignment = getDispatchAssignment(job.id);

                      if (!assignment) {
                        return null;
                      }

                      if (assignment.acknowledged_at) {
                        return (
                          <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-black text-green-800">
                            ✓ Assignment Acknowledged
                          </div>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() =>
                            void acknowledgeAssignment(job.id)
                          }
                          disabled={acknowledgingJobId === job.id}
                          className="mt-3 w-full rounded-lg bg-red-700 px-3 py-3 text-sm font-black text-white disabled:opacity-60"
                        >
                          {acknowledgingJobId === job.id
                            ? "Acknowledging..."
                            : "Acknowledge Assignment"}
                        </button>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {highPriorityJobs.length > 0 && (
            <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
                High Priority
              </p>
              <p className="mt-1 font-black text-gray-950">
                {highPriorityJobs.length} high-priority job
                {highPriorityJobs.length === 1 ? "" : "s"} assigned.
              </p>
            </div>
          )}

          {overdueJobs.length > 0 && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-orange-700">
                Schedule Attention
              </p>
              <p className="mt-1 font-black text-orange-950">
                {overdueJobs.length} job
                {overdueJobs.length === 1 ? "" : "s"} past scheduled start.
              </p>
            </div>
          )}

          {scheduledSoonJobs.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                Starting Soon
              </p>
              <p className="mt-1 font-black text-amber-950">
                {scheduledSoonJobs.length} job
                {scheduledSoonJobs.length === 1 ? "" : "s"} scheduled within the next hour.
              </p>
            </div>
          )}
        </section>
      )}

      <section
        className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
          openShift
            ? "border-green-200 bg-green-50"
            : "bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">
              Daily Payroll Clock
            </p>
            <h2 className="mt-1 text-xl font-black">
              {openShift ? "Clocked In" : "Not Clocked In"}
            </h2>

            {openShift && (
              <>
                <p className="mt-2 font-mono text-3xl font-black text-bakerssPink">
                  {formatDuration(shiftElapsedSeconds)}
                </p>
                <p className="mt-1 text-xs font-bold text-gray-600">
                  Started {formatDate(openShift.clock_in_time)}
                </p>
              </>
            )}
          </div>

          <span
            className={`rounded-full px-3 py-2 text-xs font-black uppercase ${
              openShift
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {openShift ? "On Clock" : "Off Clock"}
          </span>
        </div>

        <form
          onSubmit={
            openShift
              ? handleClockOutForDay
              : handleClockInForDay
          }
          className="mt-4 space-y-3"
        >
          <input
            id="dailyClockNote"
            type="text"
            value={clockNote}
            onChange={(event) => setClockNote(event.target.value)}
            placeholder={
              openShift
                ? "Optional end-of-day note"
                : "Optional starting note"
            }
            disabled={isUpdatingClock}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:bg-gray-100"
          />

          <button
            type="submit"
            disabled={isUpdatingClock}
            className={`w-full rounded-xl px-5 py-4 text-base font-black text-white disabled:opacity-50 ${
              openShift ? "bg-red-600" : "bg-green-600"
            }`}
          >
            {isUpdatingClock
              ? "Updating..."
              : openShift
                ? "Clock Out for Day"
                : "Clock In for Day"}
          </button>
        </form>
      </section>

      {openJobTimer && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">
            Current Job
          </p>
          <h2 className="mt-1 text-xl font-black text-blue-950">
            {activeJob?.job_title ?? "Assigned Work Order"}
          </h2>
          <p className="mt-2 text-sm font-bold text-blue-800">
            {formatStatus(openJobTimer.activity_type)} time is running.
          </p>

          {openJobTimer.job_id && (
            <Link
              href={`/technician/jobs/${openJobTimer.job_id}`}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-4 text-sm font-black text-white"
            >
              Return to Current Job
            </Link>
          )}
        </section>
      )}

      {!openJobTimer && nextJob && (
        <section className="rounded-2xl border border-pink-200 bg-pink-50 p-4 shadow-sm sm:p-5">
          <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
            Next Job
          </p>
          <h2 className="mt-1 text-xl font-black">
            {nextJob.job_title}
          </h2>
          <p className="mt-1 text-sm font-bold text-gray-700">
            {formatDate(nextJob.scheduled_start)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openMaps(nextJob)}
              disabled={!getPropertyAddress(nextJob)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black disabled:opacity-40"
            >
              Navigate
            </button>
            <Link
              href={`/technician/jobs/${nextJob.id}`}
              className="flex items-center justify-center rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white"
            >
              Open Job
            </Link>
          </div>
        </section>
      )}

      {orderedTodayJobs.length > 0 && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Daily Route
              </p>
              <h2 className="text-xl font-black">
                Today's Job Sequence
              </h2>
            </div>

            <button
              type="button"
              onClick={() => void calculateTodayTravel()}
              disabled={isCalculatingTravel || orderedTodayJobs.length < 2}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-black disabled:opacity-40"
            >
              {isCalculatingTravel ? "Calculating..." : "Travel Times"}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {orderedTodayJobs.map((job, index) => {
              const previousJob =
                index > 0 ? orderedTodayJobs[index - 1] : null;
              const leg = previousJob
                ? travelLegMap.get(`${previousJob.id}:${job.id}`)
                : null;
              const timing = previousJob && leg
                ? getTimingRisk(
                    previousJob,
                    job,
                    leg.travelMinutes,
                  )
                : null;

              const isCurrent = openJobTimer?.job_id === job.id;
              const isNext = !openJobTimer && nextJob?.id === job.id;

              return (
                <div key={job.id}>
                  {leg && (
                    <div className="mb-2 ml-5 border-l-2 border-dashed border-gray-300 pl-4">
                      <p className="text-xs font-black text-gray-600">
                        Drive: {leg.travelMinutes} min ·{" "}
                        {leg.distanceMiles.toFixed(1)} mi
                      </p>
                      {timing && (
                        <p
                          className={`mt-1 text-xs font-black ${
                            timing.risk
                              ? "text-red-700"
                              : "text-green-700"
                          }`}
                        >
                          {timing.risk
                            ? `Timing risk: ${timing.message}`
                            : `Schedule buffer: ${timing.message}`}
                        </p>
                      )}
                    </div>
                  )}

                  <article
                    className={`rounded-xl border p-4 ${
                      isCurrent
                        ? "border-blue-300 bg-blue-50"
                        : isNext
                          ? "border-pink-300 bg-pink-50"
                          : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-950 text-sm font-black text-white">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-gray-950">
                            {job.job_title}
                          </p>

                          {isCurrent && (
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black uppercase text-blue-800">
                              Current
                            </span>
                          )}

                          {isNext && (
                            <span className="rounded-full bg-pink-100 px-2 py-1 text-[10px] font-black uppercase text-bakerssPink">
                              Next
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm font-bold text-gray-700">
                          {formatTime(job.scheduled_start)} ·{" "}
                          {formatEstimatedDuration(
                            job.estimated_duration_minutes,
                          )}
                        </p>

                        <p className="mt-1 text-xs text-gray-600">
                          {job.properties?.property_name ||
                            job.properties?.street_address ||
                            "No property"}
                        </p>
                      </div>

                      <Link
                        href={`/technician/jobs/${job.id}`}
                        className="shrink-0 rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white"
                      >
                        Open
                      </Link>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Assignments
            </p>
            <h2 className="text-xl font-black">My Jobs</h2>
          </div>

          <button
            type="button"
            onClick={() => void loadPage()}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-black"
          >
            Refresh
          </button>
        </div>

        {!errorMessage && jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-black">
              No active jobs assigned
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              New assignments will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => {
              const propertyName =
                job.properties?.property_name ||
                job.properties?.street_address ||
                "No property selected";

              const propertyAddress = getPropertyAddress(job);
              const isActiveJob = openJobTimer?.job_id === job.id;

              return (
                <article
                  key={job.id}
                  className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                    isActiveJob
                      ? "border-blue-400 ring-2 ring-blue-100"
                      : ""
                  }`}
                >
                  <div className="border-b bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClasses(
                          job.job_status,
                        )}`}
                      >
                        {formatStatus(job.job_status)}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getPriorityClasses(
                          job.priority,
                        )}`}
                      >
                        {job.priority || "normal"} priority
                      </span>

                      {isActiveJob && (
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black uppercase text-blue-800">
                          Active Timer
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
                      {job.services?.service_name || "General Service"}
                    </p>

                    <h3 className="mt-1 text-xl font-black text-gray-900 sm:text-2xl">
                      {job.job_title}
                    </h3>

                    <div className="mt-3 rounded-xl bg-gray-50 p-3">
                      <p className="font-black text-gray-900">
                        {propertyName}
                      </p>

                      {propertyAddress && (
                        <p className="mt-1 text-sm text-gray-600">
                          {propertyAddress}
                        </p>
                      )}

                      <p className="mt-2 text-sm font-bold text-gray-700">
                        Customer:{" "}
                        {job.clients?.client_name || "No customer"}
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                          Scheduled
                        </p>
                        <p className="mt-1 font-bold text-gray-900">
                          {formatDate(job.scheduled_start)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                          Duration
                        </p>
                        <p className="mt-1 font-bold text-gray-900">
                          {formatEstimatedDuration(
                            job.estimated_duration_minutes,
                          )}
                        </p>
                      </div>
                    </div>

                    {job.description && (
                      <p className="mt-3 line-clamp-2 rounded-xl border bg-white p-3 text-sm leading-6 text-gray-700">
                        {job.description}
                      </p>
                    )}

                    {(() => {
                      const assignment = getDispatchAssignment(job.id);

                      if (!assignment) {
                        return null;
                      }

                      if (assignment.acknowledged_at) {
                        return (
                          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-black text-green-800">
                            ✓ Assignment Acknowledged
                          </div>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() =>
                            void acknowledgeAssignment(job.id)
                          }
                          disabled={acknowledgingJobId === job.id}
                          className="mt-4 w-full rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900 disabled:opacity-60"
                        >
                          {acknowledgingJobId === job.id
                            ? "Acknowledging..."
                            : "Acknowledge Assignment"}
                        </button>
                      );
                    })()}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openMaps(job)}
                        disabled={!propertyAddress}
                        className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-900 disabled:opacity-40"
                      >
                        Navigate
                      </button>

                      <Link
                        href={`/technician/jobs/${job.id}`}
                        className="flex items-center justify-center rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white"
                      >
                        Open Job
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-2xl backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
          {openJobTimer?.job_id ? (
            <Link
              href={`/technician/jobs/${openJobTimer.job_id}`}
              className="flex items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white"
            >
              Current Job
            </Link>
          ) : nextJob ? (
            <Link
              href={`/technician/jobs/${nextJob.id}`}
              className="flex items-center justify-center rounded-xl bg-bakerssPink px-4 py-3 text-sm font-black text-white"
            >
              Next Job
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-xl bg-gray-200 px-4 py-3 text-sm font-black text-gray-500"
            >
              No Job
            </button>
          )}

          <button
            type="button"
            onClick={() => void loadPage()}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-900"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}