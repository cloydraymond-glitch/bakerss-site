"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase/client";

type Client = {
  client_name: string;
};

type Property = {
  id: string;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

type EmployeeRelation = {
  full_name: string;
};

type ServiceRelation = {
  service_name: string;
  default_duration_minutes: number | null;
};

type Job = {
  id: string;
  job_title: string;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  assigned_employee_id: string | null;
  estimated_price: number | null;
  estimated_duration_minutes: number | null;
  clients: Client | Client[] | null;
  properties: Property | Property[] | null;
  employees: EmployeeRelation | EmployeeRelation[] | null;
  services: ServiceRelation | ServiceRelation[] | null;
};

type Employee = {
  id: string;
  full_name: string;
  employment_status: string | null;
};

type TravelTimeResult = {
  travelMinutes: number;
  distanceMiles: number;
  source: string;
  cached: boolean;
};

type TravelTimeState = Record<string, TravelTimeResult>;

type AssignmentState = Record<string, string>;

type RecurringAutomationResult = {
  created_count: number;
  skipped_count: number;
  failed_count: number;
};

type ActiveJobTimer = {
  id: string;
  employee_id: string;
  job_id: string | null;
  activity_type: string | null;
  clock_in_time: string;
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

type DispatchResponseStatus =
  | "waiting"
  | "acknowledged"
  | "started"
  | "escalated"
  | "closed";

export default function DispatchBoardPage() {
  const [selectedDate, setSelectedDate] =
    useState(getTodayInput());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] =
    useState<Employee[]>([]);
  const [assignments, setAssignments] =
    useState<AssignmentState>({});
  const [durationEdits, setDurationEdits] =
    useState<Record<string, string>>({});
  const [activeJobTimers, setActiveJobTimers] =
    useState<ActiveJobTimer[]>([]);
  const [dispatchAssignments, setDispatchAssignments] =
    useState<DispatchAssignment[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [liveDispatchStatus, setLiveDispatchStatus] =
    useState<"connecting" | "live" | "offline">("connecting");
  const [lastLiveUpdate, setLastLiveUpdate] =
    useState<string | null>(null);
  const [liveUpdateMessage, setLiveUpdateMessage] =
    useState("Waiting for dispatch changes.");
  const [isPreparingRecurring, setIsPreparingRecurring] =
    useState(false);
  const [maxHoursPerTechnician, setMaxHoursPerTechnician] =
    useState(8);
  const [travelBufferMinutes, setTravelBufferMinutes] =
    useState(30);
  const [travelTimes, setTravelTimes] =
    useState<TravelTimeState>({});
  const [
    calculatingRouteEmployeeId,
    setCalculatingRouteEmployeeId,
  ] = useState<string | null>(null);
  const [savingJobId, setSavingJobId] =
    useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const loadBoard = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      const { error: escalationError } = await supabase.rpc(
        "escalate_overdue_dispatch_assignments",
      );

      if (escalationError) {
        console.warn(
          "Dispatch escalation check failed:",
          escalationError.message,
        );
      }

      const rangeStart = new Date(
        `${selectedDate}T00:00:00`,
      ).toISOString();

      const rangeEndDate = new Date(
        `${selectedDate}T00:00:00`,
      );
      rangeEndDate.setDate(rangeEndDate.getDate() + 1);
      const rangeEnd = rangeEndDate.toISOString();

      const [
        jobsResponse,
        employeesResponse,
        activeTimersResponse,
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
              assigned_employee_id,
              estimated_price,
              estimated_duration_minutes,
              clients (
                client_name
              ),
              properties (
                id,
                property_name,
                street_address,
                city,
                state,
                latitude,
                longitude
              ),
              employees (
                full_name
              ),
              services (
                service_name,
                default_duration_minutes
              )
            `)
            .gte("scheduled_start", rangeStart)
            .lt("scheduled_start", rangeEnd)
            .not("job_status", "eq", "cancelled")
            .order("scheduled_start", {
              ascending: true,
            }),

          supabase
            .from("employees")
            .select(`
              id,
              full_name,
              employment_status
            `)
            .eq("employment_status", "active")
            .order("full_name", { ascending: true }),

          supabase
            .from("employee_timeclock")
            .select(`
              id,
              employee_id,
              job_id,
              activity_type,
              clock_in_time
            `)
            .eq("entry_type", "job")
            .is("clock_out_time", null),

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
            .is("closed_at", null),
        ]);

      const firstError =
        jobsResponse.error ||
        employeesResponse.error ||
        activeTimersResponse.error ||
        dispatchAssignmentsResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setJobs([]);
        setEmployees([]);
        setAssignments({});
        setActiveJobTimers([]);
        setDispatchAssignments([]);
      } else {
        const loadedJobs =
          (jobsResponse.data ?? []) as unknown as Job[];

        setJobs(loadedJobs);
        setEmployees(
          (employeesResponse.data ?? []) as Employee[],
        );
        setActiveJobTimers(
          (activeTimersResponse.data ?? []) as ActiveJobTimer[],
        );
        setDispatchAssignments(
          (dispatchAssignmentsResponse.data ?? []) as DispatchAssignment[],
        );
        setAssignments(
          Object.fromEntries(
            loadedJobs.map((job) => [
              job.id,
              job.assigned_employee_id ?? "",
            ]),
          ),
        );
        setDurationEdits(
          Object.fromEntries(
            loadedJobs.map((job) => [
              job.id,
              job.estimated_duration_minutes?.toString() ?? "",
            ]),
          ),
        );
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [selectedDate],
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = (message: string) => {
      setLiveUpdateMessage(message);
      setLastLiveUpdate(new Date().toISOString());

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void loadBoard(true);
      }, 250);
    };

    const channel = supabase
      .channel("admin-live-dispatch")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        (payload) => {
          const message =
            payload.eventType === "INSERT"
              ? "New work order added"
              : payload.eventType === "DELETE"
                ? "Work order removed"
                : "Work order updated";

          scheduleRefresh(message);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employee_timeclock",
        },
        (payload) => {
          const message =
            payload.eventType === "INSERT"
              ? "Technician timer started"
              : payload.eventType === "DELETE"
                ? "Technician timer removed"
                : "Technician timer updated";

          scheduleRefresh(message);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatch_assignments",
        },
        (payload) => {
          const message =
            payload.eventType === "INSERT"
              ? "New technician assignment created"
              : payload.eventType === "DELETE"
                ? "Dispatch assignment removed"
                : "Technician acknowledgment updated";

          scheduleRefresh(message);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveDispatchStatus("live");
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setLiveDispatchStatus("offline");
        }
      });

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      void supabase.removeChannel(channel);
    };
  }, [loadBoard]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadBoard(true);
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [loadBoard]);

  const employeeColumns = useMemo(() => {
    const capacityMinutes = maxHoursPerTechnician * 60;

    return employees.map((employee) => {
      const employeeJobs = jobs.filter(
        (job) =>
          job.assigned_employee_id === employee.id,
      );

      const activeJobs = employeeJobs.filter(
        (job) =>
          job.job_status !== "completed" &&
          job.job_status !== "cancelled",
      );

      const urgentJobs = activeJobs.filter(
        (job) =>
          job.priority === "urgent" ||
          job.priority === "high",
      ).length;

      const scheduledValue = employeeJobs.reduce(
        (sum, job) =>
          sum + Number(job.estimated_price ?? 0),
        0,
      );

      const scheduledMinutes = activeJobs.reduce(
        (sum, job) =>
          sum + (getEffectiveDurationMinutes(job) ?? 0),
        0,
      );

      const unestimatedJobs = activeJobs.filter(
        (job) => getEffectiveDurationMinutes(job) === null,
      ).length;

      const utilization =
        capacityMinutes > 0
          ? scheduledMinutes / capacityMinutes
          : 0;

      const workloadStatus: WorkloadStatus =
        scheduledMinutes > capacityMinutes
          ? "overloaded"
          : utilization >= 0.8
            ? "near_capacity"
            : "available";

      const conflictCount = countScheduleConflicts(
        activeJobs,
        travelBufferMinutes,
      );

      const routedJobs = [...activeJobs]
        .filter((job) => Boolean(getPropertyAddress(job)))
        .sort(compareScheduledJobs);

      const routeUrl = buildGoogleMapsRouteUrl(routedJobs);
      const routeLegs = buildRouteLegs(
        routedJobs,
        travelTimes,
      );

      const knownTravelMinutes = routeLegs.reduce(
        (sum, leg) =>
          sum + Number(leg.travel?.travelMinutes ?? 0),
        0,
      );

      const knownDistanceMiles = routeLegs.reduce(
        (sum, leg) =>
          sum + Number(leg.travel?.distanceMiles ?? 0),
        0,
      );

      const routeRiskCount = routeLegs.filter(
        (leg) => leg.scheduleRisk,
      ).length;

      return {
        employee,
        jobs: employeeJobs,
        activeJobs,
        urgentJobs,
        scheduledValue,
        scheduledMinutes,
        unestimatedJobs,
        utilization,
        workloadStatus,
        conflictCount,
        routedJobs,
        routeUrl,
        routeLegs,
        knownTravelMinutes,
        knownDistanceMiles,
        routeRiskCount,
      };
    });
  }, [
    employees,
    jobs,
    maxHoursPerTechnician,
    travelBufferMinutes,
    travelTimes,
  ]);

  const scheduleConflictData = useMemo(() => {
    const conflictJobIds = new Set<string>();
    let conflictPairs = 0;

    for (const employee of employees) {
      const employeeJobs = jobs.filter(
        (job) =>
          job.assigned_employee_id === employee.id &&
          job.job_status !== "completed" &&
          job.job_status !== "cancelled",
      );

      for (let firstIndex = 0; firstIndex < employeeJobs.length; firstIndex += 1) {
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < employeeJobs.length;
          secondIndex += 1
        ) {
          const firstJob = employeeJobs[firstIndex];
          const secondJob = employeeJobs[secondIndex];

          if (
            jobsOverlap(
              firstJob,
              secondJob,
              travelBufferMinutes,
            )
          ) {
            conflictPairs += 1;
            conflictJobIds.add(firstJob.id);
            conflictJobIds.add(secondJob.id);
          }
        }
      }
    }

    return {
      conflictPairs,
      conflictJobIds,
    };
  }, [employees, jobs, travelBufferMinutes]);

  const overloadedTechnicians = useMemo(
    () =>
      employeeColumns.filter(
        (column) =>
          column.workloadStatus === "overloaded",
      ).length,
    [employeeColumns],
  );

  const techniciansNearCapacity = useMemo(
    () =>
      employeeColumns.filter(
        (column) =>
          column.workloadStatus === "near_capacity",
      ).length,
    [employeeColumns],
  );

  const unassignedJobs = useMemo(
    () =>
      jobs.filter(
        (job) => !job.assigned_employee_id,
      ),
    [jobs],
  );

  const dispatchExceptions = useMemo(() => {
    const now = Date.now();

    const activeJobs = jobs.filter(
      (job) =>
        job.job_status !== "completed" &&
        job.job_status !== "cancelled",
    );

    const urgentNotStarted = activeJobs.filter(
      (job) =>
        (job.priority === "urgent" ||
          job.priority === "high") &&
        job.job_status !== "in_progress" &&
        job.job_status !== "completion_requested",
    );

    const overdueJobs = activeJobs.filter((job) => {
      if (
        !job.scheduled_start ||
        job.job_status === "in_progress" ||
        job.job_status === "completion_requested"
      ) {
        return false;
      }

      const scheduledTime = new Date(
        job.scheduled_start,
      ).getTime();

      return (
        !Number.isNaN(scheduledTime) &&
        scheduledTime < now
      );
    });

    const missingDurationJobs = activeJobs.filter(
      (job) => getEffectiveDurationMinutes(job) === null,
    );

    const missingRouteReadyJobs = activeJobs.filter(
      (job) => {
        const property = normalizeRelation(job.properties);

        return Boolean(
          property &&
            (property.latitude === null ||
              property.longitude === null),
        );
      },
    );

    const completionReviewJobs = jobs.filter(
      (job) =>
        job.job_status === "completion_requested",
    );

    const longRunningTimers = activeJobTimers
      .map((timer) => {
        const startedAt = new Date(
          timer.clock_in_time,
        ).getTime();

        if (Number.isNaN(startedAt)) {
          return null;
        }

        const elapsedMinutes = Math.max(
          0,
          Math.round((now - startedAt) / 60000),
        );

        const job = timer.job_id
          ? jobs.find(
              (candidate) => candidate.id === timer.job_id,
            ) ?? null
          : null;

        const estimatedMinutes = job
          ? getEffectiveDurationMinutes(job)
          : null;

        const isLong =
          typeof estimatedMinutes === "number"
            ? elapsedMinutes > estimatedMinutes + 60
            : elapsedMinutes > 240;

        if (!isLong) {
          return null;
        }

        const employee =
          employees.find(
            (candidate) =>
              candidate.id === timer.employee_id,
          ) ?? null;

        return {
          ...timer,
          elapsedMinutes,
          estimatedMinutes,
          job,
          employee,
        };
      })
      .filter(
        (
          timer,
        ): timer is NonNullable<typeof timer> =>
          timer !== null,
      );

    return {
      urgentNotStarted,
      overdueJobs,
      missingDurationJobs,
      missingRouteReadyJobs,
      completionReviewJobs,
      longRunningTimers,
    };
  }, [activeJobTimers, employees, jobs]);

  const exceptionCount =
    dispatchExceptions.urgentNotStarted.length +
    dispatchExceptions.overdueJobs.length +
    dispatchExceptions.missingDurationJobs.length +
    dispatchExceptions.missingRouteReadyJobs.length +
    dispatchExceptions.completionReviewJobs.length +
    dispatchExceptions.longRunningTimers.length;

  const dispatchResponseSummary = useMemo(() => {
    let waiting = 0;
    let acknowledged = 0;
    let started = 0;
    let escalated = 0;

    for (const job of jobs) {
      if (!job.assigned_employee_id) {
        continue;
      }

      const assignment =
        dispatchAssignments.find(
          (item) =>
            item.job_id === job.id &&
            item.employee_id === job.assigned_employee_id &&
            !item.closed_at,
        ) ?? null;

      const hasActiveTimer = activeJobTimers.some(
        (timer) =>
          timer.job_id === job.id &&
          timer.employee_id === job.assigned_employee_id,
      );

      const status = getDispatchResponseStatus(
        job,
        assignment,
        hasActiveTimer,
      );

      if (status === "waiting") waiting += 1;
      if (status === "acknowledged") acknowledged += 1;
      if (status === "started") started += 1;
      if (status === "escalated") escalated += 1;
    }

    return {
      waiting,
      acknowledged,
      started,
      escalated,
    };
  }, [activeJobTimers, dispatchAssignments, jobs]);

  const summary = useMemo(() => {
    const active = jobs.filter(
      (job) =>
        job.job_status !== "completed" &&
        job.job_status !== "cancelled",
    );

    return {
      total: jobs.length,
      unassigned: unassignedJobs.length,
      completed: jobs.filter(
        (job) => job.job_status === "completed",
      ).length,
      urgent: active.filter(
        (job) =>
          job.priority === "urgent" ||
          job.priority === "high",
      ).length,
      overdue: dispatchExceptions.overdueJobs.length,
      completionReview:
        dispatchExceptions.completionReviewJobs.length,
      exceptions: exceptionCount,
      value: jobs.reduce(
        (sum, job) =>
          sum + Number(job.estimated_price ?? 0),
        0,
      ),
    };
  }, [
    dispatchExceptions.completionReviewJobs.length,
    dispatchExceptions.overdueJobs.length,
    exceptionCount,
    jobs,
    unassignedJobs.length,
  ]);

  async function calculateRouteTravelTimes(
    employeeId: string,
    routedJobs: Job[],
  ) {
    if (
      calculatingRouteEmployeeId ||
      routedJobs.length < 2
    ) {
      return;
    }

    setCalculatingRouteEmployeeId(employeeId);
    setErrorMessage("");
    setSuccessMessage("");

    let calculatedCount = 0;
    let failureCount = 0;

    for (
      let index = 0;
      index < routedJobs.length - 1;
      index += 1
    ) {
      const originJob = routedJobs[index];
      const destinationJob = routedJobs[index + 1];

      const originProperty = normalizeRelation(
        originJob.properties,
      );
      const destinationProperty = normalizeRelation(
        destinationJob.properties,
      );

      if (
        !originProperty?.id ||
        !destinationProperty?.id
      ) {
        failureCount += 1;
        continue;
      }

      const key = travelTimeKey(
        originProperty.id,
        destinationProperty.id,
      );

      try {
        const response = await fetch("/api/travel-time", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            originPropertyId: originProperty.id,
            destinationPropertyId:
              destinationProperty.id,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          failureCount += 1;
          continue;
        }

        setTravelTimes((current) => ({
          ...current,
          [key]: {
            travelMinutes: Number(
              payload.travelMinutes ?? 0,
            ),
            distanceMiles: Number(
              payload.distanceMiles ?? 0,
            ),
            source: String(
              payload.source ?? "routing",
            ),
            cached: Boolean(payload.cached),
          },
        }));

        calculatedCount += 1;
      } catch {
        failureCount += 1;
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, 250),
      );
    }

    setCalculatingRouteEmployeeId(null);

    if (failureCount === 0) {
      setSuccessMessage(
        `${calculatedCount} travel leg${
          calculatedCount === 1 ? "" : "s"
        } calculated.`,
      );
    } else {
      setSuccessMessage(
        `${calculatedCount} travel legs calculated. ${failureCount} could not be routed.`,
      );
    }
  }

  async function prepareRecurringWork() {
    if (
      isPreparingRecurring ||
      isRefreshing ||
      savingJobId
    ) {
      return;
    }

    setIsPreparingRecurring(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc(
      "create_missing_recurring_jobs",
      {
        p_days_ahead: 14,
      },
    );

    if (error) {
      setErrorMessage(error.message);
      setIsPreparingRecurring(false);
      return;
    }

    const result = Array.isArray(data)
      ? ((data[0] ?? null) as RecurringAutomationResult | null)
      : (data as RecurringAutomationResult | null);

    const created = Number(
      result?.created_count ?? 0,
    );
    const skipped = Number(
      result?.skipped_count ?? 0,
    );
    const failed = Number(
      result?.failed_count ?? 0,
    );

    if (failed > 0) {
      setErrorMessage(
        `Recurring preparation completed with ${failed} failed visit${
          failed === 1 ? "" : "s"
        }.`,
      );
    }

    setSuccessMessage(
      `Recurring work prepared: ${created} created, ${skipped} skipped, ${failed} failed.`,
    );

    setIsPreparingRecurring(false);
    await loadBoard(true);
  }

  async function syncOpenDispatchAssignment(
    jobId: string,
    employeeId: string | null,
  ) {
    const { data: openAssignments, error: lookupError } = await supabase
      .from("dispatch_assignments")
      .select("id, employee_id")
      .eq("job_id", jobId)
      .is("closed_at", null);

    if (lookupError) {
      return lookupError;
    }

    const currentAssignments = openAssignments ?? [];
    const matchingAssignment = employeeId
      ? currentAssignments.find(
          (assignment) => assignment.employee_id === employeeId,
        )
      : null;

    const assignmentsToClose = currentAssignments.filter(
      (assignment) => !matchingAssignment || assignment.id !== matchingAssignment.id,
    );

    if (assignmentsToClose.length > 0) {
      const now = new Date().toISOString();
      const { error: closeError } = await supabase
        .from("dispatch_assignments")
        .update({
          assignment_status: "closed",
          closed_at: now,
        })
        .in(
          "id",
          assignmentsToClose.map((assignment) => assignment.id),
        );

      if (closeError) {
        return closeError;
      }
    }

    if (employeeId && !matchingAssignment) {
      const { error: insertError } = await supabase
        .from("dispatch_assignments")
        .insert({
          job_id: jobId,
          employee_id: employeeId,
          assignment_status: "assigned",
          assigned_at: new Date().toISOString(),
        });

      if (insertError) {
        return insertError;
      }
    }

    return null;
  }

  async function saveAssignment(job: Job) {
    if (savingJobId) {
      return;
    }

    const nextEmployeeId =
      assignments[job.id] ?? "";

    if (
      nextEmployeeId &&
      nextEmployeeId !== job.assigned_employee_id
    ) {
      const technician = employees.find(
        (employee) => employee.id === nextEmployeeId,
      );

      const technicianName =
        technician?.full_name || "This technician";

      const existingMinutes = jobs
        .filter(
          (item) =>
            item.id !== job.id &&
            item.assigned_employee_id === nextEmployeeId &&
            item.job_status !== "completed" &&
            item.job_status !== "cancelled",
        )
        .reduce(
          (sum, item) =>
            sum + (getEffectiveDurationMinutes(item) ?? 0),
          0,
        );

      const jobMinutes = getEffectiveDurationMinutes(job);

      if (jobMinutes === null) {
        const confirmed = window.confirm(
          `${job.job_title} does not have an estimated duration yet. Assign it to ${technicianName} anyway?`,
        );

        if (!confirmed) {
          setErrorMessage(
            "Assignment cancelled. Add an estimated duration first.",
          );
          return;
        }
      } else {
        const projectedMinutes = existingMinutes + jobMinutes;
        const capacityMinutes = maxHoursPerTechnician * 60;

        if (projectedMinutes > capacityMinutes) {
          const confirmed = window.confirm(
            `${technicianName} would be scheduled for ${formatDurationMinutes(projectedMinutes)}, above the current ${formatHours(maxHoursPerTechnician)} daily capacity. Assign anyway?`,
          );

          if (!confirmed) {
            setErrorMessage(
              `Assignment cancelled. ${technicianName} would exceed the current daily capacity.`,
            );
            return;
          }
        }

        const overlappingJobs = jobs.filter(
          (item) =>
            item.id !== job.id &&
            item.assigned_employee_id === nextEmployeeId &&
            item.job_status !== "completed" &&
            item.job_status !== "cancelled" &&
            jobsOverlap(
              job,
              item,
              travelBufferMinutes,
            ),
        );

        if (overlappingJobs.length > 0) {
          const overlapNames = overlappingJobs
            .slice(0, 3)
            .map((item) => item.job_title)
            .join(", ");

          const confirmed = window.confirm(
            `${technicianName} has a schedule or travel-buffer conflict with ${overlapNames}. Assign anyway?`,
          );

          if (!confirmed) {
            setErrorMessage(
              `Assignment cancelled. ${technicianName} does not have enough scheduled time between those jobs.`,
            );
            return;
          }
        }
      }
    }

    setSavingJobId(job.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("jobs")
      .update({
        assigned_employee_id:
          nextEmployeeId || null,
      })
      .eq("id", job.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingJobId(null);
      return;
    }

    const dispatchError = await syncOpenDispatchAssignment(
      job.id,
      nextEmployeeId || null,
    );

    if (dispatchError) {
      await supabase
        .from("jobs")
        .update({ assigned_employee_id: job.assigned_employee_id })
        .eq("id", job.id);

      setErrorMessage(
        `Technician assignment could not be synchronized with dispatch: ${dispatchError.message}`,
      );
      setSavingJobId(null);
      await loadBoard(true);
      return;
    }

    setSuccessMessage(
      nextEmployeeId
        ? "Technician assignment and dispatch record updated."
        : "Work order moved to unassigned and dispatch closed.",
    );

    setSavingJobId(null);
    await loadBoard(true);
  }

  async function saveEstimatedDuration(job: Job) {
    if (savingJobId) {
      return;
    }

    const rawValue = durationEdits[job.id]?.trim() ?? "";
    const nextMinutes =
      rawValue === "" ? null : Number(rawValue);

    if (
      nextMinutes !== null &&
      (!Number.isInteger(nextMinutes) ||
        nextMinutes < 15 ||
        nextMinutes > 1440)
    ) {
      setErrorMessage(
        "Estimated duration must be a whole number from 15 to 1440 minutes.",
      );
      return;
    }

    setSavingJobId(job.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("jobs")
      .update({
        estimated_duration_minutes: nextMinutes,
      })
      .eq("id", job.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingJobId(null);
      return;
    }

    setSuccessMessage(
      nextMinutes === null
        ? "Work-order duration estimate cleared."
        : `Estimated duration saved: ${formatDurationMinutes(nextMinutes)}.`,
    );

    setSavingJobId(null);
    await loadBoard(true);
  }

  async function updateStatus(
    job: Job,
    nextStatus: string,
  ) {
    if (savingJobId) {
      return;
    }

    setSavingJobId(job.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("jobs")
      .update({ job_status: nextStatus })
      .eq("id", job.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingJobId(null);
      return;
    }

    setSuccessMessage(
      `Work order marked ${formatStatus(
        nextStatus,
      )}.`,
    );
    setSavingJobId(null);
    await loadBoard(true);
  }

  if (isLoading) {
    return (
      <main>
        <h1 className="text-3xl font-black">
          Dispatch Board
        </h1>

        <p className="mt-3 font-bold text-gray-500">
          Loading schedule…
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-bakerssPink">
            Scheduling & Dispatch
          </p>

          <h1 className="mt-1 text-3xl font-black">
            Daily Dispatch Board
          </h1>

          <p className="mt-2 text-gray-600">
            Prepare recurring work, assign technicians,
            review workload, and manage the day&apos;s work orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/operations"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800"
          >
            Operations Control
          </Link>

          <Link
            href="/schedule"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800"
          >
            Schedule
          </Link>

          <Link
            href="/recurring-dispatch"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800"
          >
            Recurring Readiness
          </Link>

          <Link
            href="/work-orders"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800"
          >
            Work Orders
          </Link>

          <button
            type="button"
            onClick={() => void prepareRecurringWork()}
            disabled={
              isPreparingRecurring ||
              isRefreshing ||
              Boolean(savingJobId)
            }
            className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isPreparingRecurring
              ? "Preparing…"
              : "Prepare Recurring Work"}
          </button>

          <button
            type="button"
            onClick={() => void loadBoard(true)}
            disabled={isRefreshing}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
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

      <section
        className={`rounded-2xl border p-4 shadow-sm ${
          liveDispatchStatus === "live"
            ? "border-green-200 bg-green-50"
            : liveDispatchStatus === "offline"
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Live Admin Dispatch
            </p>
            <h2 className="mt-1 text-lg font-black text-gray-950">
              Realtime Operations Feed
            </h2>
            <p className="mt-1 text-sm font-semibold text-gray-600">
              {liveUpdateMessage}
              {lastLiveUpdate
                ? ` • ${formatLiveUpdateTime(lastLiveUpdate)}`
                : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-2 text-xs font-black uppercase ${
                liveDispatchStatus === "live"
                  ? "bg-green-200 text-green-900"
                  : liveDispatchStatus === "offline"
                    ? "bg-red-200 text-red-900"
                    : "bg-amber-200 text-amber-900"
              }`}
            >
              {liveDispatchStatus === "live"
                ? "Live"
                : liveDispatchStatus === "offline"
                  ? "Offline"
                  : "Connecting"}
            </span>

            <button
              type="button"
              onClick={() => void loadBoard(true)}
              disabled={isRefreshing}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-black text-gray-900 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Now"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[240px_220px_220px_1fr] xl:items-end">
          <label>
            <span className="mb-2 block text-sm font-black">
              Dispatch Date
            </span>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Daily Capacity
            </span>

            <div className="grid grid-cols-[1fr_auto]">
              <input
                type="number"
                min="1"
                max="16"
                step="0.5"
                value={maxHoursPerTechnician}
                onChange={(event) =>
                  setMaxHoursPerTechnician(
                    Math.max(
                      1,
                      Math.min(
                        16,
                        Number(event.target.value) || 1,
                      ),
                    ),
                  )
                }
                className="w-full rounded-l-xl border border-r-0 border-gray-300 px-4 py-3"
              />
              <span className="rounded-r-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
                hrs
              </span>
            </div>
          </label>

          <label>
            <span className="mb-2 block text-sm font-black">
              Travel Buffer
            </span>

            <div className="grid grid-cols-[1fr_auto]">
              <input
                type="number"
                min="0"
                max="180"
                step="5"
                value={travelBufferMinutes}
                onChange={(event) =>
                  setTravelBufferMinutes(
                    Math.max(
                      0,
                      Math.min(
                        180,
                        Number(event.target.value) || 0,
                      ),
                    ),
                  )
                }
                className="w-full rounded-l-xl border border-r-0 border-gray-300 px-4 py-3"
              />
              <span className="rounded-r-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
                min
              </span>
            </div>
          </label>

          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <strong className="text-gray-950">
              Dispatch safeguards:
            </strong>{" "}
            capacity uses estimated job duration, and schedule conflicts
            include the travel buffer between technician assignments.
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Scheduled"
          value={summary.total.toString()}
        />

        <SummaryCard
          label="Unassigned"
          value={summary.unassigned.toString()}
          warning={summary.unassigned > 0}
        />

        <SummaryCard
          label="High / Urgent"
          value={summary.urgent.toString()}
          warning={summary.urgent > 0}
        />

        <SummaryCard
          label="Completed"
          value={summary.completed.toString()}
          positive={summary.completed > 0}
        />

        <SummaryCard
          label="Scheduled Value"
          value={formatCurrency(summary.value)}
        />
      </section>

      <section
        className={`rounded-2xl border p-5 shadow-sm ${
          exceptionCount > 0
            ? "border-amber-200 bg-amber-50/40"
            : "border-green-200 bg-green-50/40"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Dispatch Exceptions
            </p>
            <h2 className="mt-1 text-xl font-black text-gray-950">
              Operations Attention Center
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Focus on work that needs intervention instead of manually scanning the board.
            </p>
          </div>

          <span
            className={`w-fit rounded-full px-3 py-2 text-xs font-black uppercase ${
              exceptionCount > 0
                ? "bg-amber-200 text-amber-950"
                : "bg-green-200 text-green-900"
            }`}
          >
            {exceptionCount > 0
              ? `${exceptionCount} Attention Item${
                  exceptionCount === 1 ? "" : "s"
                }`
              : "All Clear"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ExceptionCard
            label="Urgent / High Not Started"
            value={dispatchExceptions.urgentNotStarted.length}
            tone="red"
            detail="Priority work still waiting to start."
          />

          <ExceptionCard
            label="Past Scheduled Start"
            value={dispatchExceptions.overdueJobs.length}
            tone="orange"
            detail="Scheduled work has passed its start time."
          />

          <ExceptionCard
            label="Active Timers Running Long"
            value={dispatchExceptions.longRunningTimers.length}
            tone="red"
            detail="Timer exceeds estimate by 60+ min, or 4 hrs with no estimate."
          />

          <ExceptionCard
            label="Unassigned"
            value={unassignedJobs.length}
            tone="amber"
            detail="Jobs still need a technician."
          />

          <ExceptionCard
            label="Missing Duration"
            value={dispatchExceptions.missingDurationJobs.length}
            tone="amber"
            detail="Capacity and schedule projections are incomplete."
          />

          <ExceptionCard
            label="Route Not Ready"
            value={dispatchExceptions.missingRouteReadyJobs.length}
            tone="amber"
            detail="Property coordinates are missing."
          />

          <ExceptionCard
            label="Completion Review"
            value={dispatchExceptions.completionReviewJobs.length}
            tone="blue"
            detail="Technician submissions are waiting for review."
            href="/work-orders/completion-review"
          />
        </div>

        {exceptionCount > 0 && (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {(dispatchExceptions.urgentNotStarted.length > 0 ||
              dispatchExceptions.overdueJobs.length > 0) && (
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Jobs Needing Attention
                </p>

                <div className="mt-3 space-y-2">
                  {[
                    ...dispatchExceptions.urgentNotStarted,
                    ...dispatchExceptions.overdueJobs,
                  ]
                    .filter(
                      (job, index, list) =>
                        list.findIndex(
                          (candidate) =>
                            candidate.id === job.id,
                        ) === index,
                    )
                    .slice(0, 6)
                    .map((job) => {
                      const employee = normalizeRelation(
                        job.employees,
                      );
                      const isOverdue =
                        dispatchExceptions.overdueJobs.some(
                          (candidate) =>
                            candidate.id === job.id,
                        );

                      return (
                        <Link
                          key={job.id}
                          href={`/work-orders/${job.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 transition hover:bg-gray-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-gray-950">
                              {job.job_title}
                            </span>
                            <span className="mt-1 block text-xs font-bold text-gray-500">
                              {employee?.full_name ??
                                "Unassigned"}{" "}
                              •{" "}
                              {job.scheduled_start
                                ? new Date(
                                    job.scheduled_start,
                                  ).toLocaleTimeString([], {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })
                                : "No time"}
                            </span>
                          </span>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${
                              isOverdue
                                ? "bg-orange-100 text-orange-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {isOverdue
                              ? "Overdue"
                              : job.priority ?? "Priority"}
                          </span>
                        </Link>
                      );
                    })}
                </div>
              </div>
            )}

            {dispatchExceptions.longRunningTimers.length >
              0 && (
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Long Active Timers
                </p>

                <div className="mt-3 space-y-2">
                  {dispatchExceptions.longRunningTimers
                    .slice(0, 6)
                    .map((timer) => (
                      <div
                        key={timer.id}
                        className="rounded-lg border px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-gray-950">
                              {timer.employee?.full_name ??
                                "Technician"}
                            </p>
                            <p className="mt-1 truncate text-xs font-bold text-gray-500">
                              {timer.job?.job_title ??
                                "Active job timer"}{" "}
                              •{" "}
                              {timer.activity_type ??
                                "work"}
                            </p>
                          </div>

                          <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-black text-red-800">
                            {formatDurationMinutes(
                              timer.elapsedMinutes,
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Dispatch Accountability
            </p>
            <h2 className="mt-1 text-xl font-black text-gray-950">
              Technician Assignment Response
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Tracks whether assigned work is waiting, acknowledged, started, or overdue for acknowledgment.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-amber-100 px-3 py-2 text-amber-900">
              {dispatchResponseSummary.waiting} Waiting
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-2 text-blue-900">
              {dispatchResponseSummary.acknowledged} Acknowledged
            </span>
            <span className="rounded-full bg-green-100 px-3 py-2 text-green-900">
              {dispatchResponseSummary.started} Started
            </span>
            <span
              className={`rounded-full px-3 py-2 ${
                dispatchResponseSummary.escalated > 0
                  ? "bg-red-700 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {dispatchResponseSummary.escalated} Escalated
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-xs font-bold text-gray-600">
          Escalation rule: urgent assignments escalate after 10 minutes without acknowledgment; high-priority assignments escalate after 20 minutes.
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Workload Balancing
            </p>
            <h2 className="mt-1 text-xl font-black">
              Technician Capacity
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Capacity is based on estimated production time for active work orders on the selected day.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-red-100 px-3 py-2 text-red-800">
              {overloadedTechnicians} Overloaded
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-2 text-amber-800">
              {techniciansNearCapacity} Near Capacity
            </span>
            <span
              className={`rounded-full px-3 py-2 ${
                scheduleConflictData.conflictPairs > 0
                  ? "bg-red-700 text-white"
                  : "bg-green-100 text-green-800"
              }`}
            >
              {scheduleConflictData.conflictPairs} Schedule Conflict
              {scheduleConflictData.conflictPairs === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employeeColumns.map((column) => (
            <div
              key={column.employee.id}
              className={`rounded-xl border p-4 ${getWorkloadCardClasses(
                column.workloadStatus,
              )}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-gray-950">
                    {column.employee.full_name}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                    {formatWorkloadStatus(column.workloadStatus)}
                  </p>
                </div>

                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-gray-800">
                  {formatDurationMinutes(column.scheduledMinutes)} / {formatHours(maxHoursPerTechnician)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
                <WorkloadMetric
                  label="Hours"
                  value={formatDurationMinutes(column.scheduledMinutes)}
                />
                <WorkloadMetric
                  label="Jobs"
                  value={column.activeJobs.length.toString()}
                />
                <WorkloadMetric
                  label="Unestimated"
                  value={column.unestimatedJobs.toString()}
                />
                <WorkloadMetric
                  label="Conflicts"
                  value={column.conflictCount.toString()}
                />
                <WorkloadMetric
                  label="Value"
                  value={formatCompactCurrency(column.scheduledValue)}
                />
              </div>
            </div>
          ))}

          {employeeColumns.length === 0 && (
            <p className="text-sm font-bold text-gray-500">
              No active technicians are available.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <p className="font-black text-blue-950">
          Scheduling Windows
        </p>
        <p className="mt-1 text-sm text-blue-800">
          Each scheduled work order projects an end time from its start
          time plus estimated duration. Conflict detection also reserves the
          selected travel buffer after each job before the technician can
          start the next assignment.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-gray-500">
            Route Intelligence
          </p>
          <h2 className="mt-1 text-xl font-black">
            Technician Routes & Drive Time
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Jobs follow scheduled order. Calculate Travel uses property
            coordinates to retrieve directional drive time and mileage,
            then caches the result for future dispatch planning.
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {employeeColumns.map((column) => (
            <div
              key={column.employee.id}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-gray-950">
                      {column.employee.full_name}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                      {column.routedJobs.length} mapped stop
                      {column.routedJobs.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {column.routedJobs.length >= 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          void calculateRouteTravelTimes(
                            column.employee.id,
                            column.routedJobs,
                          )
                        }
                        disabled={Boolean(
                          calculatingRouteEmployeeId,
                        )}
                        className="rounded-xl bg-bakerssPink px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                      >
                        {calculatingRouteEmployeeId ===
                        column.employee.id
                          ? "Calculating…"
                          : "Calculate Travel"}
                      </button>
                    )}

                    {column.routeUrl ? (
                      <a
                        href={column.routeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-gray-950 px-4 py-2 text-center text-sm font-black text-white"
                      >
                        Open Google Maps
                      </a>
                    ) : (
                      <span className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-500">
                        Route unavailable
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <RouteMetric
                    label="Drive Time"
                    value={
                      column.knownTravelMinutes > 0
                        ? formatDurationMinutes(
                            column.knownTravelMinutes,
                          )
                        : "—"
                    }
                  />
                  <RouteMetric
                    label="Miles"
                    value={
                      column.knownDistanceMiles > 0
                        ? `${column.knownDistanceMiles.toFixed(
                            1,
                          )} mi`
                        : "—"
                    }
                  />
                  <RouteMetric
                    label="Timing Risks"
                    value={column.routeRiskCount.toString()}
                    warning={column.routeRiskCount > 0}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {column.routedJobs.slice(0, 10).map(
                  (job, index) => {
                    const nextJob =
                      column.routedJobs[index + 1] ?? null;

                    const leg = nextJob
                      ? findRouteLeg(
                          column.routeLegs,
                          job.id,
                          nextJob.id,
                        )
                      : null;

                    return (
                      <div key={job.id}>
                        <div className="grid grid-cols-[32px_1fr_auto] items-start gap-3 rounded-lg bg-white p-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-950 text-xs font-black text-white">
                            {index + 1}
                          </span>

                          <div>
                            <p className="text-sm font-black text-gray-950">
                              {job.job_title}
                            </p>
                            <p className="mt-1 text-xs text-gray-600">
                              {getPropertyAddress(job)}
                            </p>
                            {getProjectedWindow(job) && (
                              <p className="mt-1 text-xs font-bold text-green-700">
                                Job: {getProjectedWindow(job)}
                              </p>
                            )}
                          </div>

                          <span className="text-xs font-black text-gray-600">
                            {formatTime(job.scheduled_start)}
                          </span>
                        </div>

                        {leg && (
                          <div
                            className={`ml-4 border-l-2 py-2 pl-6 text-xs ${
                              leg.scheduleRisk
                                ? "border-red-400 text-red-700"
                                : "border-blue-300 text-blue-700"
                            }`}
                          >
                            {leg.travel ? (
                              <span className="font-black">
                                Drive to stop {index + 2}:{" "}
                                {leg.travel.travelMinutes} min ·{" "}
                                {leg.travel.distanceMiles.toFixed(
                                  1,
                                )} mi
                                {leg.scheduleRisk &&
                                  " · SCHEDULE RISK"}
                              </span>
                            ) : (
                              <span className="font-bold">
                                Drive time not calculated yet
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}

                {column.routedJobs.length === 0 && (
                  <p className="rounded-lg bg-white p-3 text-sm font-bold text-gray-500">
                    No scheduled jobs with usable property addresses.
                  </p>
                )}

                {column.routedJobs.length > 10 && (
                  <p className="text-xs font-bold text-amber-700">
                    Showing the first 10 stops. Google Maps waypoint limits may
                    vary by device.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
              Unassigned Work
            </p>

            <h2 className="mt-1 text-xl font-black text-amber-950">
              {unassignedJobs.length} Work Order
              {unassignedJobs.length === 1 ? "" : "s"}
            </h2>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {unassignedJobs.map((job) => (
            <DispatchCard
              key={job.id}
              job={job}
              employees={employees}
              selectedEmployeeId={
                assignments[job.id] ?? ""
              }
              onAssignmentChange={(employeeId) =>
                setAssignments((current) => ({
                  ...current,
                  [job.id]: employeeId,
                }))
              }
              onSaveAssignment={() =>
                void saveAssignment(job)
              }
              durationValue={durationEdits[job.id] ?? ""}
              onDurationChange={(value) =>
                setDurationEdits((current) => ({
                  ...current,
                  [job.id]: value,
                }))
              }
              onSaveDuration={() =>
                void saveEstimatedDuration(job)
              }
              onStatusChange={(status) =>
                void updateStatus(job, status)
              }
              hasScheduleConflict={scheduleConflictData.conflictJobIds.has(
                job.id,
              )}
              dispatchAssignment={
                dispatchAssignments.find(
                  (item) =>
                    item.job_id === job.id &&
                    item.employee_id === job.assigned_employee_id &&
                    !item.closed_at,
                ) ?? null
              }
              hasActiveJobTimer={activeJobTimers.some(
                (timer) =>
                  timer.job_id === job.id &&
                  timer.employee_id === job.assigned_employee_id,
              )}
              isSaving={savingJobId === job.id}
            />
          ))}

          {unassignedJobs.length === 0 && (
            <p className="rounded-xl bg-white p-4 text-sm font-bold text-green-700">
              All scheduled work orders are assigned.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {employeeColumns.map(
          ({
            employee,
            jobs: employeeJobs,
            activeJobs,
            workloadStatus,
            conflictCount,
          }) => (
            <section
              key={employee.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                    Technician
                  </p>

                  <h2 className="mt-1 text-xl font-black">
                    {employee.full_name}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${getWorkloadBadgeClasses(
                      workloadStatus,
                    )}`}
                  >
                    {formatWorkloadStatus(workloadStatus)}
                  </span>

                  {conflictCount > 0 && (
                    <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-black text-white">
                      {conflictCount} conflict
                      {conflictCount === 1 ? "" : "s"}
                    </span>
                  )}

                  <span className="rounded-full bg-gray-950 px-3 py-1 text-xs font-black text-white">
                    {activeJobs.length} active / {employeeJobs.length} total
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {employeeJobs.map((job) => (
                  <DispatchCard
                    key={job.id}
                    job={job}
                    employees={employees}
                    selectedEmployeeId={
                      assignments[job.id] ?? ""
                    }
                    onAssignmentChange={(employeeId) =>
                      setAssignments((current) => ({
                        ...current,
                        [job.id]: employeeId,
                      }))
                    }
                    onSaveAssignment={() =>
                      void saveAssignment(job)
                    }
                    durationValue={durationEdits[job.id] ?? ""}
                    onDurationChange={(value) =>
                      setDurationEdits((current) => ({
                        ...current,
                        [job.id]: value,
                      }))
                    }
                    onSaveDuration={() =>
                      void saveEstimatedDuration(job)
                    }
                    onStatusChange={(status) =>
                      void updateStatus(job, status)
                    }
                    hasScheduleConflict={scheduleConflictData.conflictJobIds.has(
                      job.id,
                    )}
                    dispatchAssignment={
                      dispatchAssignments.find(
                        (item) =>
                          item.job_id === job.id &&
                          item.employee_id === job.assigned_employee_id &&
                          !item.closed_at,
                      ) ?? null
                    }
                    hasActiveJobTimer={activeJobTimers.some(
                      (timer) =>
                        timer.job_id === job.id &&
                        timer.employee_id === job.assigned_employee_id,
                    )}
                    isSaving={
                      savingJobId === job.id
                    }
                  />
                ))}

                {employeeJobs.length === 0 && (
                  <p className="rounded-xl bg-gray-50 p-4 text-sm font-bold text-gray-500">
                    No work orders assigned for this date.
                  </p>
                )}
              </div>
            </section>
          ),
        )}
      </section>
    </main>
  );
}

function getDispatchResponseStatus(
  job: Job,
  assignment: DispatchAssignment | null,
  hasActiveJobTimer: boolean,
): DispatchResponseStatus {
  if (!assignment) {
    return job.assigned_employee_id
      ? "waiting"
      : "closed";
  }

  if (assignment.closed_at || assignment.assignment_status === "closed") {
    return "closed";
  }

  if (
    assignment.started_at ||
    assignment.assignment_status === "started" ||
    hasActiveJobTimer ||
    job.job_status === "in_progress" ||
    job.job_status === "completion_requested" ||
    job.job_status === "completed"
  ) {
    return "started";
  }

  if (
    assignment.escalated_at ||
    assignment.assignment_status === "escalated"
  ) {
    return "escalated";
  }

  if (
    assignment.acknowledged_at ||
    assignment.assignment_status === "acknowledged"
  ) {
    return "acknowledged";
  }

  const assignedAt = new Date(assignment.assigned_at).getTime();

  if (!Number.isNaN(assignedAt)) {
    const ageMinutes = Math.max(
      0,
      Math.floor((Date.now() - assignedAt) / 60000),
    );

    if (job.priority === "urgent" && ageMinutes >= 10) {
      return "escalated";
    }

    if (job.priority === "high" && ageMinutes >= 20) {
      return "escalated";
    }
  }

  return "waiting";
}

function formatDispatchResponseStatus(
  status: DispatchResponseStatus,
) {
  switch (status) {
    case "acknowledged":
      return "Acknowledged";
    case "started":
      return "Started";
    case "escalated":
      return "Escalated";
    case "closed":
      return "Closed";
    default:
      return "Waiting";
  }
}

function getDispatchResponseClasses(
  status: DispatchResponseStatus,
) {
  switch (status) {
    case "acknowledged":
      return "bg-blue-100 text-blue-800";
    case "started":
      return "bg-green-100 text-green-800";
    case "escalated":
      return "bg-red-700 text-white";
    case "closed":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-amber-100 text-amber-900";
  }
}

function getDispatchResponsePanelClasses(
  status: DispatchResponseStatus,
) {
  switch (status) {
    case "acknowledged":
      return "border-blue-200 bg-blue-50 text-blue-950";
    case "started":
      return "border-green-200 bg-green-50 text-green-950";
    case "escalated":
      return "border-red-300 bg-red-50 text-red-950";
    case "closed":
      return "border-gray-200 bg-gray-50 text-gray-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-950";
  }
}

function formatDispatchTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDispatchAssignmentAge(value: string) {
  const assignedAt = new Date(value).getTime();

  if (Number.isNaN(assignedAt)) {
    return "Age unavailable";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - assignedAt) / 60000),
  );

  if (minutes < 1) {
    return "Assigned just now";
  }

  if (minutes < 60) {
    return `Assigned ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `Assigned ${hours}h ago`;
  }

  return `Assigned ${hours}h ${remainder}m ago`;
}

function DispatchCard({
  job,
  employees,
  selectedEmployeeId,
  onAssignmentChange,
  onSaveAssignment,
  durationValue,
  onDurationChange,
  onSaveDuration,
  onStatusChange,
  hasScheduleConflict,
  dispatchAssignment,
  hasActiveJobTimer,
  isSaving,
}: {
  job: Job;
  employees: Employee[];
  selectedEmployeeId: string;
  onAssignmentChange: (employeeId: string) => void;
  onSaveAssignment: () => void;
  durationValue: string;
  onDurationChange: (value: string) => void;
  onSaveDuration: () => void;
  onStatusChange: (status: string) => void;
  hasScheduleConflict: boolean;
  dispatchAssignment: DispatchAssignment | null;
  hasActiveJobTimer: boolean;
  isSaving: boolean;
}) {
  const client = normalizeRelation(job.clients);
  const property = normalizeRelation(job.properties);
  const service = normalizeRelation(job.services);
  const effectiveDuration = getEffectiveDurationMinutes(job);
  const projectedWindow = getProjectedWindow(job);
  const dispatchResponseStatus = getDispatchResponseStatus(
    job,
    dispatchAssignment,
    hasActiveJobTimer,
  );

  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        hasScheduleConflict
          ? "border-red-300 ring-2 ring-red-100"
          : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getPriorityClasses(
                job.priority,
              )}`}
            >
              {job.priority || "normal"}
            </span>

            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase text-gray-700">
              {formatStatus(
                job.job_status || "new",
              )}
            </span>

            {job.assigned_employee_id && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getDispatchResponseClasses(
                  dispatchResponseStatus,
                )}`}
              >
                {formatDispatchResponseStatus(
                  dispatchResponseStatus,
                )}
              </span>
            )}

            {hasScheduleConflict && (
              <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-black uppercase text-white">
                Schedule Conflict
              </span>
            )}
          </div>

          <h3 className="mt-3 font-black text-gray-950">
            {job.job_title}
          </h3>

          <p className="mt-2 text-sm font-bold text-gray-700">
            {client?.client_name || "No customer"}
          </p>

          <p className="mt-1 text-sm text-gray-600">
            {property
              ? formatProperty(property)
              : "No property"}
          </p>

          <p className="mt-2 text-sm font-bold text-gray-700">
            {formatTime(job.scheduled_start)}
            {" · "}
            {formatCurrency(
              Number(job.estimated_price ?? 0),
            )}
            {" · "}
            {effectiveDuration === null
              ? "Duration not estimated"
              : formatDurationMinutes(effectiveDuration)}
          </p>

          {projectedWindow && (
            <p
              className={`mt-1 text-xs font-black ${
                hasScheduleConflict
                  ? "text-red-700"
                  : "text-green-700"
              }`}
            >
              Projected window: {projectedWindow}
            </p>
          )}

          {job.estimated_duration_minutes === null &&
            service?.default_duration_minutes && (
              <p className="mt-1 text-xs font-bold text-blue-700">
                Using {formatDurationMinutes(service.default_duration_minutes)} service default until a work-order estimate is saved.
              </p>
            )}
        </div>

        <Link
          href={`/work-orders/${job.id}`}
          className="text-sm font-black text-bakerssPink"
        >
          Open
        </Link>
      </div>

      {job.assigned_employee_id && dispatchAssignment && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 ${getDispatchResponsePanelClasses(
            dispatchResponseStatus,
          )}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-wide">
              Assignment Response
            </p>
            <span className="text-xs font-black">
              {formatDispatchAssignmentAge(
                dispatchAssignment.assigned_at,
              )}
            </span>
          </div>

          <div className="mt-2 grid gap-2 text-xs font-bold sm:grid-cols-3">
            <div>
              <span className="block opacity-60">Assigned</span>
              <span>
                {formatDispatchTimestamp(
                  dispatchAssignment.assigned_at,
                )}
              </span>
            </div>

            <div>
              <span className="block opacity-60">Acknowledged</span>
              <span>
                {dispatchAssignment.acknowledged_at
                  ? formatDispatchTimestamp(
                      dispatchAssignment.acknowledged_at,
                    )
                  : "Waiting"}
              </span>
            </div>

            <div>
              <span className="block opacity-60">Started</span>
              <span>
                {dispatchAssignment.started_at
                  ? formatDispatchTimestamp(
                      dispatchAssignment.started_at,
                    )
                  : hasActiveJobTimer ||
                      job.job_status === "in_progress"
                    ? "Started"
                    : "Not started"}
              </span>
            </div>
          </div>

          {dispatchResponseStatus === "escalated" && (
            <p className="mt-2 text-xs font-black">
              Technician acknowledgment is overdue for this priority level.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <select
          value={selectedEmployeeId}
          onChange={(event) =>
            onAssignmentChange(event.target.value)
          }
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-bold"
        >
          <option value="">Unassigned</option>

          {employees.map((employee) => (
            <option
              key={employee.id}
              value={employee.id}
            >
              {employee.full_name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onSaveAssignment}
          disabled={isSaving}
          className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Assign"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label>
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500">
            Estimated Duration (minutes)
          </span>
          <input
            type="number"
            min="15"
            max="1440"
            step="15"
            value={durationValue}
            onChange={(event) =>
              onDurationChange(event.target.value)
            }
            placeholder={
              service?.default_duration_minutes
                ? `Service default: ${service.default_duration_minutes}`
                : "e.g. 90"
            }
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-bold"
          />
        </label>

        <button
          type="button"
          onClick={onSaveDuration}
          disabled={isSaving}
          className="self-end rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save Duration"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {job.job_status !== "in_progress" && (
          <button
            type="button"
            onClick={() =>
              onStatusChange("in_progress")
            }
            disabled={isSaving}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 disabled:opacity-50"
          >
            Start
          </button>
        )}

        {job.job_status !== "completion_requested" &&
          job.job_status !== "completed" && (
            <button
              type="button"
              onClick={() =>
                onStatusChange(
                  "completion_requested",
                )
              }
              disabled={isSaving}
              className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-black text-purple-800 disabled:opacity-50"
            >
              Request Review
            </button>
          )}
      </div>
    </article>
  );
}

type RouteLeg = {
  originJobId: string;
  destinationJobId: string;
  travel: TravelTimeResult | null;
  availableMinutes: number | null;
  scheduleRisk: boolean;
};

function travelTimeKey(
  originPropertyId: string,
  destinationPropertyId: string,
) {
  return `${originPropertyId}:${destinationPropertyId}`;
}

function buildRouteLegs(
  jobs: Job[],
  travelTimes: TravelTimeState,
): RouteLeg[] {
  const legs: RouteLeg[] = [];

  for (let index = 0; index < jobs.length - 1; index += 1) {
    const originJob = jobs[index];
    const destinationJob = jobs[index + 1];

    const originProperty = normalizeRelation(
      originJob.properties,
    );
    const destinationProperty = normalizeRelation(
      destinationJob.properties,
    );

    const key =
      originProperty?.id && destinationProperty?.id
        ? travelTimeKey(
            originProperty.id,
            destinationProperty.id,
          )
        : "";

    const travel = key
      ? travelTimes[key] ?? null
      : null;

    const originWindow = getJobWindow(originJob);
    const destinationStart =
      destinationJob.scheduled_start
        ? new Date(
            destinationJob.scheduled_start,
          ).getTime()
        : null;

    const availableMinutes =
      originWindow && destinationStart !== null
        ? Math.floor(
            (destinationStart - originWindow.end) /
              60_000,
          )
        : null;

    const scheduleRisk =
      travel !== null &&
      availableMinutes !== null &&
      availableMinutes < travel.travelMinutes;

    legs.push({
      originJobId: originJob.id,
      destinationJobId: destinationJob.id,
      travel,
      availableMinutes,
      scheduleRisk,
    });
  }

  return legs;
}

function findRouteLeg(
  legs: RouteLeg[],
  originJobId: string,
  destinationJobId: string,
) {
  return (
    legs.find(
      (leg) =>
        leg.originJobId === originJobId &&
        leg.destinationJobId === destinationJobId,
    ) ?? null
  );
}

function getPropertyAddress(job: Job) {
  const property = normalizeRelation(job.properties);

  if (!property) {
    return "";
  }

  return [
    property.street_address,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(", ");
}

function compareScheduledJobs(firstJob: Job, secondJob: Job) {
  const firstTime = firstJob.scheduled_start
    ? new Date(firstJob.scheduled_start).getTime()
    : Number.MAX_SAFE_INTEGER;

  const secondTime = secondJob.scheduled_start
    ? new Date(secondJob.scheduled_start).getTime()
    : Number.MAX_SAFE_INTEGER;

  return firstTime - secondTime;
}

function buildGoogleMapsRouteUrl(jobs: Job[]) {
  const stops = jobs
    .map((job) => getPropertyAddress(job))
    .filter(Boolean)
    .slice(0, 10);

  if (stops.length === 0) {
    return null;
  }

  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      stops[0],
    )}`;
  }

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

type JobWindow = {
  start: number;
  end: number;
};

function getJobWindow(job: Job): JobWindow | null {
  if (!job.scheduled_start) {
    return null;
  }

  const durationMinutes = getEffectiveDurationMinutes(job);

  if (durationMinutes === null) {
    return null;
  }

  const start = new Date(job.scheduled_start).getTime();

  if (Number.isNaN(start)) {
    return null;
  }

  return {
    start,
    end: start + durationMinutes * 60_000,
  };
}

function jobsOverlap(
  firstJob: Job,
  secondJob: Job,
  travelBufferMinutes = 0,
) {
  const firstWindow = getJobWindow(firstJob);
  const secondWindow = getJobWindow(secondJob);

  if (!firstWindow || !secondWindow) {
    return false;
  }

  const bufferMilliseconds =
    Math.max(0, travelBufferMinutes) * 60_000;

  const firstBufferedEnd =
    firstWindow.end + bufferMilliseconds;
  const secondBufferedEnd =
    secondWindow.end + bufferMilliseconds;

  return (
    firstWindow.start < secondBufferedEnd &&
    secondWindow.start < firstBufferedEnd
  );
}

function countScheduleConflicts(
  jobs: Job[],
  travelBufferMinutes = 0,
) {
  let conflicts = 0;

  for (
    let firstIndex = 0;
    firstIndex < jobs.length;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < jobs.length;
      secondIndex += 1
    ) {
      if (
        jobsOverlap(
          jobs[firstIndex],
          jobs[secondIndex],
          travelBufferMinutes,
        )
      ) {
        conflicts += 1;
      }
    }
  }

  return conflicts;
}

function getProjectedWindow(job: Job) {
  const window = getJobWindow(job);

  if (!window) {
    return null;
  }

  return `${formatClockTime(window.start)} – ${formatClockTime(window.end)}`;
}

function formatClockTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

type WorkloadStatus =
  | "available"
  | "near_capacity"
  | "overloaded";

function getEffectiveDurationMinutes(job: Job) {
  if (
    typeof job.estimated_duration_minutes === "number" &&
    job.estimated_duration_minutes > 0
  ) {
    return job.estimated_duration_minutes;
  }

  const service = normalizeRelation(job.services);

  if (
    typeof service?.default_duration_minutes === "number" &&
    service.default_duration_minutes > 0
  ) {
    return service.default_duration_minutes;
  }

  return null;
}

function formatDurationMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function formatHours(hours: number) {
  return Number.isInteger(hours)
    ? `${hours}h`
    : `${hours.toFixed(1)}h`;
}

function RouteMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        warning
          ? "border-red-200 bg-red-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-black ${
          warning ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function WorkloadMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white/80 px-2 py-3">
      <p className="text-lg font-black text-gray-950">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-gray-500">
        {label}
      </p>
    </div>
  );
}

function formatWorkloadStatus(
  status: WorkloadStatus,
) {
  if (status === "overloaded") {
    return "Overloaded";
  }

  if (status === "near_capacity") {
    return "Near Capacity";
  }

  return "Available";
}

function getWorkloadCardClasses(
  status: WorkloadStatus,
) {
  if (status === "overloaded") {
    return "border-red-200 bg-red-50";
  }

  if (status === "near_capacity") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-green-200 bg-green-50";
}

function getWorkloadBadgeClasses(
  status: WorkloadStatus,
) {
  if (status === "overloaded") {
    return "bg-red-700 text-white";
  }

  if (status === "near_capacity") {
    return "bg-amber-600 text-white";
  }

  return "bg-green-700 text-white";
}

function formatLiveUpdateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "updated just now";
  }

  return `updated ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function ExceptionCard({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "red" | "orange" | "amber" | "blue";
  href?: string;
}) {
  const classes = {
    red:
      value > 0
        ? "border-red-200 bg-red-50 text-red-950"
        : "border-gray-200 bg-white text-gray-700",
    orange:
      value > 0
        ? "border-orange-200 bg-orange-50 text-orange-950"
        : "border-gray-200 bg-white text-gray-700",
    amber:
      value > 0
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-gray-200 bg-white text-gray-700",
    blue:
      value > 0
        ? "border-blue-200 bg-blue-50 text-blue-950"
        : "border-gray-200 bg-white text-gray-700",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide">
          {label}
        </p>
        <span className="text-2xl font-black">
          {value}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold opacity-75">
        {detail}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`rounded-xl border p-4 transition hover:shadow-sm ${classes}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      {content}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        warning
          ? "border-red-200 bg-red-50"
          : positive
            ? "border-green-200 bg-green-50"
            : "bg-white"
      }`}
    >
      <p className="text-sm font-black text-gray-500">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-black ${
          warning
            ? "text-red-800"
            : positive
              ? "text-green-800"
              : "text-gray-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function normalizeRelation<T>(
  value: T | T[] | null,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getTodayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatProperty(property: Property) {
  return (
    property.property_name ||
    [
      property.street_address,
      property.city,
      property.state,
    ]
      .filter(Boolean)
      .join(", ") ||
    "Unnamed property"
  );
}

function formatTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getPriorityClasses(
  priority: string | null,
) {
  switch (priority) {
    case "urgent":
      return "bg-red-700 text-white";
    case "high":
      return "bg-amber-100 text-amber-800";
    case "low":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}