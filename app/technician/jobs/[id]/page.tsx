"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase/client";
import { compressPhotoForUpload } from "../../../../lib/compressPhoto";

type TechnicianJob = {
  id: string;
  job_title: string;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  description: string | null;
  estimated_price: number | null;
  materials_cost: number | null;
  estimated_duration_minutes: number | null;
  property_id: string | null;
  assigned_employee_id: string | null;
  clients: { client_name: string } | null;
  properties: {
    property_name: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  } | null;
  services: { service_name: string } | null;
  employees: { full_name: string } | null;
};

type JobPhoto = {
  id: string;
  photo_url: string;
  storage_path?: string;
  photo_type: string | null;
  photo_position: string | null;
  caption: string | null;
  client_visible: boolean | null;
  created_at: string;
};

type ActivityEntry = {
  id: string;
  action: string | null;
  activity_type: string | null;
  metadata: {
    note?: string;
    message?: string;
    old_value?: string;
    new_value?: string;
  } | null;
  created_at: string;
};

type TimeclockEntry = {
  id: string;
  employee_id: string;
  profile_id: string;
  job_id: string | null;
  parent_shift_id: string | null;
  entry_type: "shift" | "job";
  activity_type: "regular" | "travel" | "onsite" | "work";
  clock_in_time: string;
  clock_out_time: string | null;
  clock_in_note: string | null;
  clock_out_note: string | null;
  status: "open" | "closed" | "adjusted";
  created_at: string;
};

type PhotoType = "before" | "progress" | "completion";
type LawnPhotoPosition = "front" | "left_side" | "rear" | "right_side";

const LAWN_PHOTO_POSITIONS: Array<{
  value: LawnPhotoPosition;
  label: string;
}> = [
  { value: "front", label: "Front" },
  { value: "left_side", label: "Left Side" },
  { value: "rear", label: "Rear" },
  { value: "right_side", label: "Right Side" },
];


async function hydrateJobPhotosWithSignedUrls(
  rows: JobPhoto[],
): Promise<JobPhoto[]> {
  return Promise.all(
    rows.map(async (photo) => {
      const storagePath = photo.photo_url;

      if (!storagePath) {
        return {
          ...photo,
          storage_path: storagePath,
        };
      }

      const { data, error } = await supabase.storage
        .from("job-photos")
        .createSignedUrl(storagePath, 60 * 60 * 4);

      if (error || !data?.signedUrl) {
        console.warn(
          `Could not create signed URL for ${storagePath}:`,
          error?.message ?? "No signed URL returned.",
        );

        return {
          ...photo,
          storage_path: storagePath,
          photo_url: "",
        };
      }

      return {
        ...photo,
        storage_path: storagePath,
        photo_url: data.signedUrl,
      };
    }),
  );
}

export default function TechnicianJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workOrderId = params.id;

  const [job, setJob] = useState<TechnicianJob | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState("");
  const [currentProfileId, setCurrentProfileId] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activeTimeEntry, setActiveTimeEntry] = useState<TimeclockEntry | null>(null);
  const [activeShiftEntry, setActiveShiftEntry] = useState<TimeclockEntry | null>(null);
  const [jobTimeEntries, setJobTimeEntries] = useState<TimeclockEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [timeclockNote, setTimeclockNote] = useState("");
  const [note, setNote] = useState("");
  const [photoType, setPhotoType] = useState<PhotoType>("progress");
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoClientVisible, setPhotoClientVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [completionRequestNote, setCompletionRequestNote] = useState("");
  const [materialsCostInput, setMaterialsCostInput] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingTimeclock, setIsUpdatingTimeclock] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingMaterials, setIsSavingMaterials] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadJob = useCallback(async () => {
    if (!workOrderId) {
      setErrorMessage("Missing work-order ID.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setAccessDenied(false);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setIsLoading(false);
      router.replace("/login");
      return;
    }

    const profileId = session.user.id;
    setCurrentProfileId(profileId);

    const { data: employeeData, error: employeeError } = await supabase
      .from("employees")
      .select("id, full_name, employment_status")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (employeeError) {
      setErrorMessage(`Your employee record could not be verified: ${employeeError.message}`);
      setIsLoading(false);
      return;
    }

    if (!employeeData) {
      setAccessDenied(true);
      setErrorMessage("Your login is not connected to an employee record.");
      setIsLoading(false);
      return;
    }

    if (
      employeeData.employment_status &&
      employeeData.employment_status !== "active"
    ) {
      setAccessDenied(true);
      setErrorMessage("Your employee account is not active.");
      setIsLoading(false);
      return;
    }

    const employeeId = employeeData.id as string;
    setCurrentEmployeeId(employeeId);

    const jobResponse = await supabase
      .from("jobs")
      .select(`
        id,
        job_title,
        job_status,
        priority,
        scheduled_start,
        description,
        estimated_price,
        materials_cost,
        estimated_duration_minutes,
        property_id,
        assigned_employee_id,
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
      .eq("id", workOrderId)
      .eq("assigned_employee_id", employeeId)
      .maybeSingle();

    if (jobResponse.error) {
      setErrorMessage(jobResponse.error.message);
      setIsLoading(false);
      return;
    }

    if (!jobResponse.data) {
      setAccessDenied(true);
      setJob(null);
      setPhotos([]);
      setActivity([]);
      setErrorMessage(
        "Access denied. This work order is not assigned to your employee account.",
      );
      setIsLoading(false);
      return;
    }

    const [
      photosResponse,
      activityResponse,
      activeTimeResponse,
      activeShiftResponse,
      jobTimeResponse,
    ] = await Promise.all([
      supabase
        .from("job_photos")
        .select(`
          id,
          photo_url,
          photo_type,
          photo_position,
          caption,
          client_visible,
          created_at
        `)
        .eq("job_id", workOrderId)
        .order("created_at", { ascending: false }),

      supabase
        .from("activity_log")
        .select(`
          id,
          action,
          activity_type,
          metadata,
          created_at
        `)
        .eq("entity_type", "job")
        .eq("entity_id", workOrderId)
        .order("created_at", { ascending: false })
        .limit(20),

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
        .eq("employee_id", employeeId)
        .eq("entry_type", "job")
        .eq("status", "open")
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
        .eq("employee_id", employeeId)
        .eq("entry_type", "shift")
        .eq("status", "open")
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
        .eq("employee_id", employeeId)
        .eq("entry_type", "job")
        .eq("job_id", workOrderId)
        .order("clock_in_time", { ascending: false })
        .limit(10),
    ]);

    const relatedDataError =
      photosResponse.error ||
      activityResponse.error ||
      activeTimeResponse.error ||
      activeShiftResponse.error ||
      jobTimeResponse.error;

    if (relatedDataError) {
      setErrorMessage(relatedDataError.message);
      setIsLoading(false);
      return;
    }

    const loadedJob = jobResponse.data as unknown as TechnicianJob;
    setJob(loadedJob);
    setMaterialsCostInput(loadedJob.materials_cost === null ? "" : String(loadedJob.materials_cost));

    const signedPhotos = await hydrateJobPhotosWithSignedUrls(
      (photosResponse.data ?? []) as JobPhoto[],
    );

    setPhotos(signedPhotos);
    setActivity((activityResponse.data ?? []) as ActivityEntry[]);
    setActiveTimeEntry((activeTimeResponse.data as TimeclockEntry | null) ?? null);
    setActiveShiftEntry((activeShiftResponse.data as TimeclockEntry | null) ?? null);
    setJobTimeEntries((jobTimeResponse.data ?? []) as TimeclockEntry[]);
    setIsLoading(false);
  }, [router, workOrderId]);

  useEffect(() => {
    void loadJob();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [loadJob, router]);

  useEffect(() => {
    if (!activeTimeEntry?.clock_in_time || activeTimeEntry.clock_out_time) {
      setElapsedSeconds(0);
      return;
    }

    function updateElapsedTime() {
      const clockInMilliseconds = new Date(activeTimeEntry.clock_in_time).getTime();

      if (Number.isNaN(clockInMilliseconds)) {
        setElapsedSeconds(0);
        return;
      }

      setElapsedSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - clockInMilliseconds) / 1000),
        ),
      );
    }

    updateElapsedTime();
    const intervalId = window.setInterval(updateElapsedTime, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeTimeEntry]);

  const completionPhotoCount = useMemo(
    () => photos.filter((photo) => photo.photo_type === "completion").length,
    [photos],
  );

  const beforePhotoCount = useMemo(
    () => photos.filter((photo) => photo.photo_type === "before").length,
    [photos],
  );

  const isLawnCare = useMemo(() => {
    const serviceName = (job?.services?.service_name || "")
      .trim()
      .toLowerCase();
    const jobTitle = (job?.job_title || "").trim().toLowerCase();

    // Treat every lawn service as Lawn Care, including names such as
    // "Lawn Care", "Lawn Care 45 Min", "Weekly Lawn Care", etc.
    // The job-title fallback protects recurring/imported work orders where
    // the service relation may not be populated correctly.
    return serviceName.includes("lawn") || jobTitle.includes("lawn care");
  }, [job?.job_title, job?.services?.service_name]);

  const lawnPhotoStatus = useMemo(() => {
    const hasPhoto = (type: "before" | "completion", position: LawnPhotoPosition) =>
      photos.some(
        (photo) =>
          photo.photo_type === type && photo.photo_position === position,
      );

    const missingBefore = LAWN_PHOTO_POSITIONS.filter(
      (position) => !hasPhoto("before", position.value),
    );
    const missingAfter = LAWN_PHOTO_POSITIONS.filter(
      (position) => !hasPhoto("completion", position.value),
    );

    return {
      missingBefore,
      missingAfter,
      complete: missingBefore.length === 0 && missingAfter.length === 0,
    };
  }, [photos]);

  async function verifyOwnership() {
    if (!currentEmployeeId || !workOrderId) return false;

    const { data, error } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", workOrderId)
      .eq("assigned_employee_id", currentEmployeeId)
      .maybeSingle();

    if (error || !data) {
      setAccessDenied(true);
      setJob(null);
      setErrorMessage(
        "Access denied. This work order is no longer assigned to you.",
      );
      return false;
    }

    return true;
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
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatActivityDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function getAddress() {
    return [
      job?.properties?.street_address,
      job?.properties?.city,
      job?.properties?.state,
      job?.properties?.zip_code,
    ]
      .filter(Boolean)
      .join(", ");
  }

  function formatLawnPosition(value: LawnPhotoPosition) {
    return (
      LAWN_PHOTO_POSITIONS.find((position) => position.value === value)?.label ??
      value.replaceAll("_", " ")
    );
  }

  function getStatusClasses(status: string | null) {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completion_requested":
        return "bg-purple-100 text-purple-800";
      case "waiting_on_materials":
      case "needs_follow_up":
        return "bg-amber-100 text-amber-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-700";
    }
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

  function formatEstimatedDuration(minutes: number | null) {
    if (!minutes || minutes <= 0) return "Not set";

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours === 0) return `${remainder} min`;
    if (remainder === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;

    return `${hours}h ${remainder}m`;
  }

  function formatCurrency(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "Not reviewed";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  }

  const totalProductionSeconds = useMemo(
    () => jobTimeEntries.reduce((total, entry) => total + calculateEntrySeconds(entry), 0),
    [jobTimeEntries],
  );

  function calculateEntrySeconds(entry: TimeclockEntry) {
    const start = new Date(entry.clock_in_time).getTime();
    const end = entry.clock_out_time
      ? new Date(entry.clock_out_time).getTime()
      : Date.now();

    if (Number.isNaN(start) || Number.isNaN(end)) return 0;
    return Math.max(0, Math.floor((end - start) / 1000));
  }

  function openMaps() {
    const address = getAddress();

    if (!address) {
      setErrorMessage("No property address is available for navigation.");
      return;
    }

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        address,
      )}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function logTimeclockActivity(
    action: string,
    message: string,
    activityType: string,
  ) {
    if (!currentProfileId || !workOrderId) return;

    const { error } = await supabase.from("activity_log").insert({
      actor_profile_id: currentProfileId,
      action,
      activity_type: "timeclock",
      entity_type: "job",
      entity_id: workOrderId,
      metadata: {
        activity_type: activityType,
        note: timeclockNote.trim() || null,
        message,
      },
    });

    if (error) {
      setErrorMessage(
        `Time was recorded, but activity history was not saved: ${error.message}`,
      );
    }
  }

  async function startOrSwitchActivity(
    activityType: "travel" | "onsite" | "work",
  ) {
    if (isUpdatingTimeclock || !job) return;

    if (!activeShiftEntry) {
      setErrorMessage(
        "Clock in for your shift before starting work time.",
      );
      return;
    }

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    setIsUpdatingTimeclock(true);
    setErrorMessage("");
    setSuccessMessage("");

    const isSameJob = activeTimeEntry?.job_id === workOrderId;

    const { error } = await supabase.rpc(
      isSameJob ? "switch_job_activity" : "start_job_timer",
      {
        p_job_id: workOrderId,
        p_activity_type: activityType,
        p_note: timeclockNote.trim() || null,
      },
    );

    if (error) {
      setErrorMessage(error.message);
      setIsUpdatingTimeclock(false);
      return;
    }

    const activityLabel = formatStatus(activityType);
    const message = isSameJob
      ? `Technician changed job activity to ${activityLabel}.`
      : `Technician started ${activityLabel} time.`;

    await logTimeclockActivity(
      isSameJob
        ? "technician_job_activity_changed"
        : "technician_job_timer_started",
      message,
      activityType,
    );

    setTimeclockNote("");
    setSuccessMessage(message);
    setIsUpdatingTimeclock(false);
    await loadJob();
  }

  async function stopJobTimer() {
    if (
      isUpdatingTimeclock ||
      !activeTimeEntry ||
      activeTimeEntry.job_id !== workOrderId
    ) {
      return;
    }

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    const totalSeconds = calculateEntrySeconds(activeTimeEntry);

    setIsUpdatingTimeclock(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("stop_job_timer", {
      p_note: timeclockNote.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsUpdatingTimeclock(false);
      return;
    }

    const durationLabel = formatDuration(totalSeconds);
    const message = `Job timer stopped. Recorded ${durationLabel} of ${formatStatus(
      activeTimeEntry.activity_type,
    )} time.`;

    await logTimeclockActivity(
      "technician_job_timer_stopped",
      message,
      activeTimeEntry.activity_type,
    );

    setTimeclockNote("");
    setActiveTimeEntry(null);
    setElapsedSeconds(0);
    setSuccessMessage(message);
    setIsUpdatingTimeclock(false);
    await loadJob();
  }

  async function saveMaterialsCost() {
    if (!job || isSavingMaterials) return;

    const trimmedValue = materialsCostInput.trim();
    const amount = trimmedValue === "" ? 0 : Number(trimmedValue);

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("Enter a valid materials cost of $0 or more.");
      return;
    }

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    setIsSavingMaterials(true);
    setErrorMessage("");
    setSuccessMessage("");

    const previousAmount = job.materials_cost;
    const { error: updateError } = await supabase
      .from("jobs")
      .update({ materials_cost: amount })
      .eq("id", workOrderId)
      .eq("assigned_employee_id", currentEmployeeId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setIsSavingMaterials(false);
      return;
    }

    const message = `Materials cost reviewed: ${formatCurrency(amount)}.`;
    const { error: activityError } = await supabase
      .from("activity_log")
      .insert({
        actor_profile_id: currentProfileId,
        action: "technician_materials_cost_updated",
        activity_type: "work_order_updated",
        entity_type: "job",
        entity_id: workOrderId,
        metadata: {
          field: "materials_cost",
          label: "Materials Cost",
          old_value: previousAmount === null ? null : String(previousAmount),
          new_value: String(amount),
          message,
        },
      });

    setJob((current) => current ? { ...current, materials_cost: amount } : current);
    setMaterialsCostInput(String(amount));
    setSuccessMessage(
      activityError
        ? `${message} Activity history could not be recorded: ${activityError.message}`
        : message,
    );
    setIsSavingMaterials(false);
  }

  async function updateJobStatus(
    newStatus: "in_progress" | "completion_requested" | "needs_follow_up",
  ) {
    if (!job || isUpdatingStatus) return;

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    setIsUpdatingStatus(true);
    setErrorMessage("");
    setSuccessMessage("");

    const previousStatus = job.job_status || "new";

    const { error: updateError } = await supabase
      .from("jobs")
      .update({ job_status: newStatus })
      .eq("id", workOrderId)
      .eq("assigned_employee_id", currentEmployeeId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setIsUpdatingStatus(false);
      return;
    }

    const statusMessage = `Status changed from ${formatStatus(
      previousStatus,
    )} to ${formatStatus(newStatus)}.`;

    const { error: activityError } = await supabase
      .from("activity_log")
      .insert({
        actor_profile_id: currentProfileId,
        action: "technician_status_changed",
        activity_type: "work_order_updated",
        entity_type: "job",
        entity_id: workOrderId,
        metadata: {
          field: "job_status",
          label: "Status",
          old_value: previousStatus,
          new_value: newStatus,
          message: statusMessage,
        },
      });

    setJob((current) =>
      current ? { ...current, job_status: newStatus } : current,
    );

    if (activityError) {
      setErrorMessage(
        `Status updated, but activity history was not recorded: ${activityError.message}`,
      );
    } else {
      setSuccessMessage(statusMessage);
    }

    setIsUpdatingStatus(false);
    await loadJob();
  }

  async function handleCompletionRequest() {
    if (!job || isUpdatingStatus) return;

    if (activeTimeEntry?.job_id === workOrderId) {
      setErrorMessage("Stop this job timer before requesting completion.");
      return;
    }

    const trimmedCompletionNote = completionRequestNote.trim();

    if (!trimmedCompletionNote) {
      setErrorMessage(
        "Enter a completion note describing the work performed.",
      );
      return;
    }

    if (isLawnCare && !lawnPhotoStatus.complete) {
      const missing = [
        ...lawnPhotoStatus.missingBefore.map((item) => `Before ${item.label}`),
        ...lawnPhotoStatus.missingAfter.map((item) => `After ${item.label}`),
      ];
      setErrorMessage(
        `Lawn Care requires all 8 property photos before completion. Missing: ${missing.join(", ")}.`,
      );
      return;
    }

    if (!isLawnCare && beforePhotoCount === 0) {
      setErrorMessage(
        "Upload at least one Before photo before requesting completion.",
      );
      return;
    }

    if (!isLawnCare && completionPhotoCount === 0) {
      setErrorMessage(
        "Upload at least one Completion photo before requesting completion.",
      );
      return;
    }

    if (job.materials_cost === null) {
      setErrorMessage(
        "Review and save the materials cost before requesting completion. Enter $0 if no materials were used.",
      );
      return;
    }

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    setIsUpdatingStatus(true);
    setErrorMessage("");
    setSuccessMessage("");

    const previousStatus = job.job_status || "new";

    const { error: updateError } = await supabase
      .from("jobs")
      .update({ job_status: "completion_requested" })
      .eq("id", workOrderId)
      .eq("assigned_employee_id", currentEmployeeId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setIsUpdatingStatus(false);
      return;
    }

    const { error: activityError } = await supabase
      .from("activity_log")
      .insert({
        actor_profile_id: currentProfileId,
        action: "technician_completion_requested",
        activity_type: "work_order_updated",
        entity_type: "job",
        entity_id: workOrderId,
        metadata: {
          field: "job_status",
          label: "Completion Request",
          old_value: previousStatus,
          new_value: "completion_requested",
          note: trimmedCompletionNote,
          message: `Technician requested completion approval: ${trimmedCompletionNote}`,
        },
      });

    setJob((current) =>
      current ? { ...current, job_status: "completion_requested" } : current,
    );
    setCompletionRequestNote("");

    if (activityError) {
      setErrorMessage(
        `Completion was requested, but activity history was not recorded: ${activityError.message}`,
      );
    } else {
      setSuccessMessage(
        "Completion requested. An admin must review and approve the job.",
      );
    }

    setIsUpdatingStatus(false);
    await loadJob();
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedNote = note.trim();

    if (!trimmedNote) {
      setErrorMessage("Enter a note before saving.");
      return;
    }

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    setIsSavingNote(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.from("activity_log").insert({
      actor_profile_id: currentProfileId,
      action: "internal_note_added",
      activity_type: "internal_note",
      entity_type: "job",
      entity_id: workOrderId,
      metadata: {
        note: trimmedNote,
        message: trimmedNote,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSavingNote(false);
      return;
    }

    setNote("");
    setSuccessMessage("Internal note saved.");
    setIsSavingNote(false);
    await loadJob();
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedPhoto(file);
  }

  async function uploadJobPhoto({
    file,
    type,
    caption,
    clientVisible,
    position = null,
  }: {
    file: File;
    type: PhotoType;
    caption: string;
    clientVisible: boolean;
    position?: LawnPhotoPosition | null;
  }) {
    if (!job) {
      throw new Error("The work order could not be loaded.");
    }

    const optimizedPhoto = await compressPhotoForUpload(file);
    const extension = optimizedPhoto.type === "image/jpeg" ? "jpg" :
      optimizedPhoto.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeFileName = `${crypto.randomUUID()}.${extension}`;
    const storagePath = `${workOrderId}/${safeFileName}`;

    const { error: storageError } = await supabase.storage
      .from("job-photos")
      .upload(storagePath, optimizedPhoto, {
        cacheControl: "3600",
        upsert: false,
        contentType: optimizedPhoto.type || "image/jpeg",
      });

    if (storageError) throw storageError;

    const { error: databaseError } = await supabase
      .from("job_photos")
      .insert({
        job_id: workOrderId,
        property_id: job.property_id,
        uploaded_by: currentProfileId,
        photo_url: storagePath,
        photo_type: type,
        photo_position: position,
        caption,
        client_visible: clientVisible,
      });

    if (databaseError) {
      await supabase.storage.from("job-photos").remove([storagePath]);
      throw databaseError;
    }

    const photoLabel = position
      ? `${type === "completion" ? "After" : formatStatus(type)} ${formatLawnPosition(position)}`
      : formatStatus(type);

    const { error: activityError } = await supabase
      .from("activity_log")
      .insert({
        actor_profile_id: currentProfileId,
        action: "technician_photo_uploaded",
        activity_type: "photo_uploaded",
        entity_type: "job",
        entity_id: workOrderId,
        metadata: {
          photo_type: type,
          photo_position: position,
          caption,
          message: `${photoLabel} photo uploaded.`,
        },
      });

    return { photoLabel, activityError };
  }

  async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPhoto) {
      setErrorMessage("Select a photo before uploading.");
      return;
    }

    if (!photoCaption.trim()) {
      setErrorMessage("Enter a caption describing the photo.");
      return;
    }

    if (!job) {
      setErrorMessage("The work order could not be loaded.");
      return;
    }

    const ownsJob = await verifyOwnership();
    if (!ownsJob) return;

    setIsUploadingPhoto(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { photoLabel, activityError } = await uploadJobPhoto({
        file: selectedPhoto,
        type: photoType,
        caption: photoCaption.trim(),
        clientVisible: photoClientVisible,
      });

      setSelectedPhoto(null);
      setPhotoCaption("");
      setPhotoClientVisible(false);

      const fileInput = document.getElementById(
        "technicianPhoto",
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      if (activityError) {
        setErrorMessage(
          `Photo uploaded, but activity history was not recorded: ${activityError.message}`,
        );
      } else {
        setSuccessMessage(`${photoLabel} photo uploaded.`);
      }

      await loadJob();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Photo could not be uploaded.",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleLawnPhotoSelection(
    event: ChangeEvent<HTMLInputElement>,
    type: "before" | "completion",
    position: LawnPhotoPosition,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file || isUploadingPhoto) return;

    const ownsJob = await verifyOwnership();
    if (!ownsJob) {
      input.value = "";
      return;
    }

    const stageLabel = type === "completion" ? "After" : "Before";
    const positionLabel = formatLawnPosition(position);

    setIsUploadingPhoto(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { activityError } = await uploadJobPhoto({
        file,
        type,
        position,
        caption: `${stageLabel} - ${positionLabel}`,
        clientVisible: true,
      });

      if (activityError) {
        setErrorMessage(
          `${stageLabel} ${positionLabel} uploaded, but activity history was not recorded: ${activityError.message}`,
        );
      } else {
        setSuccessMessage(`${stageLabel} ${positionLabel} photo uploaded.`);
      }

      await loadJob();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Lawn Care photo could not be uploaded.",
      );
    } finally {
      input.value = "";
      setIsUploadingPhoto(false);
    }
  }

  function getActivityMessage(entry: ActivityEntry) {
    if (entry.metadata?.message) return entry.metadata.message;
    if (entry.metadata?.note) return entry.metadata.note;
    if (entry.action) return formatStatus(entry.action);
    return "Work-order activity recorded.";
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">Loading technician job...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-black text-red-800">
            {accessDenied ? "Access Denied" : "Work Order Not Found"}
          </h1>

          <p className="mt-2 text-sm text-red-700">
            {errorMessage || "This work order could not be loaded."}
          </p>

          <Link
            href="/technician"
            className="mt-5 inline-flex rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white"
          >
            Return to Technician Jobs
          </Link>
        </div>
      </div>
    );
  }

  const address = getAddress();
  const activeThisJob = activeTimeEntry?.job_id === workOrderId;
  const anotherJobActive =
    Boolean(activeTimeEntry?.job_id) &&
    activeTimeEntry?.job_id !== workOrderId;
  const completionLocked =
    job.job_status === "completion_requested" ||
    job.job_status === "completed" ||
    job.job_status === "cancelled";

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 sm:space-y-6 sm:pb-12">
      <header className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <Link href="/technician" className="text-sm font-black text-bakerssPink">
          ← Assigned Jobs
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-bakerssPink">
              {job.services?.service_name || "General Service"}
            </p>
            <h1 className="mt-1 break-words text-2xl font-black text-gray-950 sm:text-3xl">
              {job.job_title}
            </h1>
          </div>

          <span
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-black sm:px-4 sm:text-sm ${getStatusClasses(
              job.job_status,
            )}`}
          >
            {formatStatus(job.job_status)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-black uppercase text-gray-500">
              Scheduled
            </p>
            <p className="mt-1 font-bold">{formatDate(job.scheduled_start)}</p>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-black uppercase text-gray-500">
              Est. Duration
            </p>
            <p className="mt-1 font-bold">
              {formatEstimatedDuration(job.estimated_duration_minutes)}
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

      {!activeShiftEntry && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-black text-amber-900">
            You are not clocked in for your shift.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Clock in before starting work time.
          </p>
          <Link
            href="/technician"
            className="mt-3 inline-flex rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white"
          >
            Go to Technician Check-In
          </Link>
        </div>
      )}

      {activeThisJob && (
        <section className="sticky top-2 z-20 rounded-2xl bg-gray-950 p-4 text-white shadow-xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-300">
                {formatStatus(activeTimeEntry.activity_type)} Active
              </p>
              <p className="mt-1 font-mono text-3xl font-black sm:text-4xl">
                {formatDuration(elapsedSeconds)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void stopJobTimer()}
              disabled={isUpdatingTimeclock}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {isUpdatingTimeclock ? "Stopping..." : "Stop Timer"}
            </button>
          </div>

        </section>
      )}

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">Job Location</h2>
          {address && (
            <button
              type="button"
              onClick={openMaps}
              className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-black text-white"
            >
              Navigate
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Customer
            </p>
            <p className="mt-1 font-bold">
              {job.clients?.client_name || "No customer listed"}
            </p>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Property
            </p>
            <p className="mt-1 font-bold">
              {job.properties?.property_name ||
                job.properties?.street_address ||
                "No property listed"}
            </p>
            {address && <p className="mt-1 text-sm text-gray-600">{address}</p>}
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">
              Assigned Technician
            </p>
            <p className="mt-1 font-bold">
              {job.employees?.full_name || "Unassigned"}
            </p>
          </div>

          {job.description && (
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Instructions
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                {job.description}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-black">Job Time</h2>
        <p className="mt-1 text-sm text-gray-600">
          Track technician work time for this job.
        </p>

        {anotherJobActive ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-black text-amber-800">
              Another job timer is active.
            </p>
            <p className="mt-1 text-sm text-amber-700">
              Stop that timer before starting this work order.
            </p>
            <Link
              href={`/technician/jobs/${activeTimeEntry?.job_id}`}
              className="mt-3 inline-flex rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white"
            >
              Open Active Job
            </Link>
          </div>
        ) : (
          <>
            <label
              htmlFor="timeclockNote"
              className="mt-4 block text-sm font-black"
            >
              Time Entry Note
            </label>
            <input
              id="timeclockNote"
              type="text"
              value={timeclockNote}
              onChange={(event) => setTimeclockNote(event.target.value)}
              placeholder="Optional note"
              disabled={isUpdatingTimeclock}
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100 disabled:bg-gray-100"
            />

            {!activeThisJob && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void startOrSwitchActivity("work")}
                  disabled={isUpdatingTimeclock || !activeShiftEntry}
                  className="w-full rounded-xl bg-green-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50 sm:w-auto sm:min-w-48"
                >
                  Start Work
                </button>
              </div>
            )}
          </>
        )}

        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm font-black text-gray-700">
            Recent production entries ({jobTimeEntries.length})
          </summary>

          {jobTimeEntries.length === 0 ? (
            <p className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No production time has been recorded for this job.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {jobTimeEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-xl border bg-gray-50 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-gray-900">
                        {entry.clock_out_time
                          ? formatDuration(calculateEntrySeconds(entry))
                          : "In progress"}
                      </p>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-gray-700">
                        {formatStatus(entry.activity_type)}
                      </span>
                    </div>
                    <span className="text-xs font-black uppercase text-gray-500">
                      {entry.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-bold text-gray-600">
                    In: {formatDate(entry.clock_in_time)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-gray-600">
                    Out:{" "}
                    {entry.clock_out_time
                      ? formatDate(entry.clock_out_time)
                      : "Currently active"}
                  </p>

                  {(entry.clock_in_note || entry.clock_out_note) && (
                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                      {entry.clock_in_note && <p>Start: {entry.clock_in_note}</p>}
                      {entry.clock_out_note && <p>Finish: {entry.clock_out_note}</p>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </details>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Job Cost Capture</h2>
            <p className="mt-1 text-sm text-gray-600">
              Production time is captured automatically. Review material cost before completion.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase text-gray-700">
            Field Review
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-black uppercase text-gray-500">Production Time</p>
            <p className="mt-1 text-lg font-black text-gray-950">{formatDuration(totalProductionSeconds)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-black uppercase text-gray-500">Materials</p>
            <p className="mt-1 text-lg font-black text-gray-950">{formatCurrency(job.materials_cost)}</p>
          </div>
        </div>

        <label htmlFor="materialsCost" className="mt-4 block text-sm font-black">
          Materials Cost
        </label>
        <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-500">$</span>
            <input
              id="materialsCost"
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              value={materialsCostInput}
              onChange={(event) => setMaterialsCostInput(event.target.value)}
              disabled={isSavingMaterials || completionLocked}
              placeholder="0.00"
              className="w-full rounded-xl border border-gray-300 py-3 pl-8 pr-4 font-bold disabled:bg-gray-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void saveMaterialsCost()}
            disabled={isSavingMaterials || completionLocked}
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {isSavingMaterials ? "Saving..." : "Save"}
          </button>
        </div>
        <p className="mt-2 text-xs font-bold text-gray-500">
          Enter $0 when no materials were used so the office knows this was reviewed.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-black">Job Status</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={isUpdatingStatus || completionLocked}
            onClick={() => void updateJobStatus("in_progress")}
            className="rounded-xl bg-blue-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            Mark In Progress
          </button>

          <button
            type="button"
            disabled={isUpdatingStatus || completionLocked}
            onClick={() => void updateJobStatus("needs_follow_up")}
            className="rounded-xl border border-gray-300 bg-white px-4 py-4 text-sm font-black text-gray-800 disabled:opacity-50"
          >
            Needs Follow-Up
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-black">Job Photos</h2>
        <p className="mt-1 text-sm text-gray-600">
          {isLawnCare
            ? "Lawn Care requires Front, Left Side, Rear, and Right Side photos before and after service."
            : "Upload as many Before, Progress, and Completion photos as needed. At least one Before and one Completion photo are required."}
        </p>

        {isLawnCare ? (
          <div className="mt-4 space-y-5">
            {([
              { type: "before" as const, title: "Before Service" },
              { type: "completion" as const, title: "After Service" },
            ]).map((group) => (
              <div key={group.type}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black text-gray-950">{group.title}</h3>
                  <span className="text-xs font-black uppercase text-gray-500">
                    {LAWN_PHOTO_POSITIONS.filter((position) =>
                      photos.some(
                        (photo) =>
                          photo.photo_type === group.type &&
                          photo.photo_position === position.value,
                      ),
                    ).length}
                    /4 Complete
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  {LAWN_PHOTO_POSITIONS.map((position) => {
                    const existingPhoto = photos.find(
                      (photo) =>
                        photo.photo_type === group.type &&
                        photo.photo_position === position.value,
                    );
                    const inputId = `lawn-${group.type}-${position.value}`;

                    return (
                      <div
                        key={inputId}
                        className={`rounded-xl border p-3 ${
                          existingPhoto
                            ? "border-green-200 bg-green-50"
                            : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black">{position.label}</span>
                          <span
                            className={`text-xs font-black ${
                              existingPhoto ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {existingPhoto ? "✓ Done" : "Required"}
                          </span>
                        </div>

                        {existingPhoto && (
                          <img
                            src={existingPhoto.photo_url}
                            alt={`${group.title} - ${position.label}`}
                            className="mt-2 h-24 w-full rounded-lg object-cover"
                          />
                        )}

                        <label
                          htmlFor={inputId}
                          className="mt-3 block cursor-pointer rounded-lg bg-gray-950 px-3 py-3 text-center text-xs font-black text-white"
                        >
                          {existingPhoto ? "Add Another / Retake" : "Take Photo"}
                        </label>
                        <input
                          id={inputId}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={isUploadingPhoto || completionLocked}
                          onChange={(event) =>
                            void handleLawnPhotoSelection(
                              event,
                              group.type,
                              position.value,
                            )
                          }
                          className="sr-only"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {isUploadingPhoto && (
              <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
                Optimizing and uploading photo…
              </p>
            )}
          </div>
        ) : (
        <form onSubmit={handlePhotoUpload} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              id="photoType"
              value={photoType}
              onChange={(event) =>
                setPhotoType(event.target.value as PhotoType)
              }
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold"
            >
              <option value="before">Before</option>
              <option value="progress">Progress</option>
              <option value="completion">Completion</option>
            </select>

            <input
              id="technicianPhoto"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelection}
              className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
            />
          </div>

          <input
            id="photoCaption"
            type="text"
            value={photoCaption}
            required
            onChange={(event) => setPhotoCaption(event.target.value)}
            placeholder="Required photo caption"
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={photoClientVisible}
              onChange={(event) =>
                setPhotoClientVisible(event.target.checked)
              }
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="block font-black">Client Visible</span>
              <span className="text-xs text-gray-600">
                Allow this photo to be used in client-facing records.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={isUploadingPhoto}
            className="w-full rounded-xl bg-bakerssPink px-5 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            {isUploadingPhoto ? "Uploading Photo..." : "Upload Photo"}
          </button>
        </form>
        )}

        {photos.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <article
                key={photo.id}
                className="overflow-hidden rounded-xl border bg-gray-50"
              >
                <img
                  src={photo.photo_url}
                  alt={photo.caption || "Work-order photo"}
                  className="h-32 w-full object-cover sm:h-40"
                />
                <div className="p-2">
                  <p className="text-xs font-black uppercase">
                    {photo.photo_type || "photo"}
                  </p>
                  {photo.caption && (
                    <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                      {photo.caption}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-black">Technician Note</h2>

        <form onSubmit={handleNoteSubmit} className="mt-4">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Progress, materials, customer instructions, or follow-up details..."
            className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3"
          />

          <button
            type="submit"
            disabled={isSavingNote}
            className="mt-3 w-full rounded-xl bg-gray-950 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            {isSavingNote ? "Saving..." : "Save Note"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-black text-purple-950">
          Submit for Completion
        </h2>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div
            className={`rounded-xl p-3 ${
              !activeThisJob
                ? "bg-green-100 text-green-900"
                : "bg-red-100 text-red-900"
            }`}
          >
            <p className="font-black">
              {!activeThisJob ? "✓ Timer stopped" : "Timer still running"}
            </p>
          </div>

          <div
            className={`rounded-xl p-3 ${
              isLawnCare
                ? lawnPhotoStatus.complete
                  ? "bg-green-100 text-green-900"
                  : "bg-red-100 text-red-900"
                : beforePhotoCount > 0 && completionPhotoCount > 0
                  ? "bg-green-100 text-green-900"
                  : "bg-red-100 text-red-900"
            }`}
          >
            <p className="font-black">
              {isLawnCare
                ? lawnPhotoStatus.complete
                  ? "✓ All 8 Lawn Care photos complete"
                  : `${8 - lawnPhotoStatus.missingBefore.length - lawnPhotoStatus.missingAfter.length}/8 Lawn Care photos complete`
                : beforePhotoCount > 0 && completionPhotoCount > 0
                  ? `✓ ${beforePhotoCount} before / ${completionPhotoCount} completion`
                  : `Need ${beforePhotoCount === 0 ? "Before" : ""}${beforePhotoCount === 0 && completionPhotoCount === 0 ? " + " : ""}${completionPhotoCount === 0 ? "Completion" : ""} photo`}
            </p>
          </div>

          <div
            className={`col-span-2 rounded-xl p-3 ${
              job.materials_cost !== null
                ? "bg-green-100 text-green-900"
                : "bg-red-100 text-red-900"
            }`}
          >
            <p className="font-black">
              {job.materials_cost !== null
                ? `✓ Materials reviewed: ${formatCurrency(job.materials_cost)}`
                : "Materials cost must be reviewed before submission"}
            </p>
          </div>
        </div>

        <textarea
          id="completionRequestNote"
          value={completionRequestNote}
          onChange={(event) =>
            setCompletionRequestNote(event.target.value)
          }
          rows={4}
          disabled={completionLocked}
          placeholder="Describe completed work, testing, materials used, and anything the office should review."
          className="mt-4 w-full resize-y rounded-xl border border-purple-200 bg-white px-4 py-3 disabled:opacity-60"
        />

        <button
          type="button"
          onClick={() => void handleCompletionRequest()}
          disabled={isUpdatingStatus || completionLocked}
          className="mt-3 w-full rounded-xl bg-purple-700 px-5 py-4 text-base font-black text-white disabled:opacity-50"
        >
          {job.job_status === "completion_requested"
            ? "Awaiting Admin Approval"
            : isUpdatingStatus
              ? "Submitting..."
              : "Submit for Completion"}
        </button>
      </section>

      <details className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer text-lg font-black">
          Recent Activity ({activity.length})
        </summary>

        {activity.length === 0 ? (
          <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            No activity has been recorded.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {activity.map((entry) => (
              <article
                key={entry.id}
                className="rounded-xl border bg-gray-50 p-4"
              >
                <p className="text-sm font-bold text-gray-800">
                  {getActivityMessage(entry)}
                </p>
                <p className="mt-2 text-xs font-bold text-gray-500">
                  {formatActivityDate(entry.created_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </details>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-2xl backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
          <button
            type="button"
            onClick={openMaps}
            disabled={!address}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-900 disabled:opacity-40"
          >
            Navigate
          </button>

          {activeThisJob ? (
            <button
              type="button"
              onClick={() => void stopJobTimer()}
              disabled={isUpdatingTimeclock}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              Stop Timer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startOrSwitchActivity("work")}
              disabled={
                isUpdatingTimeclock ||
                !activeShiftEntry ||
                anotherJobActive ||
                completionLocked
              }
              className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              Start Work
            </button>
          )}
        </div>
      </div>
    </div>
  );
}