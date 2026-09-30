"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

type WorkOrder = {
  id: string;
  property_id: string | null;
  job_title: string;
  description: string | null;
  job_status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  estimated_price: number | null;
  materials_cost: number | null;
  created_at: string | null;

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

type JobPhoto = {
  id: string;
  photo_url: string;
  storage_path?: string;
  photo_type: string | null;
  caption: string | null;
  client_visible: boolean | null;
  created_at: string | null;
};

type PhotoType = "before" | "progress" | "completion";

type LinkedInvoice = {
  invoice_id: string;
  invoices: {
    id: string;
    invoice_number: string | null;
    invoice_status: string | null;
  } | null;
};

type JobTimeEntry = {
  id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  activity_type: string;
  status: string | null;
};

type ActivityEntry = {
  id: string;
  action: string;
  metadata: {
    note?: string;
    message?: string;
    photo_type?: string;
    caption?: string | null;
    client_visible?: boolean;
    old_value?: string;
    new_value?: string;
    label?: string;
  } | null;
  created_at: string;
};


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

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const workOrderId = params.id;

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [linkedInvoice, setLinkedInvoice] =
    useState<LinkedInvoice | null>(null);
  const [jobTimeEntries, setJobTimeEntries] = useState<
    JobTimeEntry[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [updatingPhotoId, setUpdatingPhotoId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [showPhotoForm, setShowPhotoForm] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isReviewingCompletion, setIsReviewingCompletion] = useState(false);
  const [isLoadingInvoiceLink, setIsLoadingInvoiceLink] =
    useState(true);
  const [isLoadingJobTime, setIsLoadingJobTime] =
    useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoType, setPhotoType] = useState<PhotoType>("before");
  const [caption, setCaption] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [completionReviewNote, setCompletionReviewNote] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [photoErrorMessage, setPhotoErrorMessage] = useState("");
  const [photoSuccessMessage, setPhotoSuccessMessage] = useState("");
  const [activityErrorMessage, setActivityErrorMessage] = useState("");
  const [activitySuccessMessage, setActivitySuccessMessage] = useState("");

  useEffect(() => {
    async function loadPage() {
      if (!workOrderId) {
        setErrorMessage("Missing work-order ID.");
        setIsLoading(false);
        setIsLoadingPhotos(false);
        setIsLoadingActivities(false);
        setIsLoadingInvoiceLink(false);
        setIsLoadingJobTime(false);
        return;
      }

      await Promise.all([
        loadWorkOrder(),
        loadPhotos(),
        loadActivities(),
        loadInvoiceLink(),
        loadJobTime(),
      ]);
    }

    async function loadWorkOrder() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("jobs")
        .select(`
          id,
          property_id,
          job_title,
          description,
          job_status,
          priority,
          scheduled_start,
          estimated_price,
          materials_cost,
          created_at,
          clients (
            client_name
          ),
          properties (
            property_name,
            street_address,
            city,
            state,
            zip_code
          ),
          services (
            service_name
          ),
          employees (
            full_name
          )
        `)
        .eq("id", workOrderId)
        .single();

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setWorkOrder(data as unknown as WorkOrder);
      setIsLoading(false);
    }

    async function loadPhotos() {
      setIsLoadingPhotos(true);
      setPhotoErrorMessage("");

      const { data, error } = await supabase
        .from("job_photos")
        .select(`
          id,
          photo_url,
          photo_type,
          caption,
          client_visible,
          created_at
        `)
        .eq("job_id", workOrderId)
        .order("created_at", { ascending: false });

      if (error) {
        setPhotoErrorMessage(error.message);
        setIsLoadingPhotos(false);
        return;
      }

      const signedPhotos = await hydrateJobPhotosWithSignedUrls(
        (data ?? []) as JobPhoto[],
      );

      setPhotos(signedPhotos);
      setIsLoadingPhotos(false);
    }

    async function loadInvoiceLink() {
      setIsLoadingInvoiceLink(true);

      const { data, error } = await supabase
        .from("invoice_line_items")
        .select(`
          invoice_id,
          invoices (
            id,
            invoice_number,
            invoice_status
          )
        `)
        .eq("job_id", workOrderId)
        .limit(1)
        .maybeSingle();

      if (error) {
        setActivityErrorMessage(error.message);
        setIsLoadingInvoiceLink(false);
        return;
      }

      setLinkedInvoice((data as unknown as LinkedInvoice | null) ?? null);
      setIsLoadingInvoiceLink(false);
    }

    async function loadJobTime() {
      setIsLoadingJobTime(true);

      const { data, error } = await supabase
        .from("employee_timeclock")
        .select(`
          id,
          clock_in_time,
          clock_out_time,
          activity_type,
          status
        `)
        .eq("entry_type", "job")
        .eq("job_id", workOrderId)
        .order("clock_in_time", { ascending: false });

      if (error) {
        setActivityErrorMessage(error.message);
        setIsLoadingJobTime(false);
        return;
      }

      setJobTimeEntries(
        (data ?? []) as JobTimeEntry[],
      );
      setIsLoadingJobTime(false);
    }

    async function loadActivities() {
      setIsLoadingActivities(true);
      setActivityErrorMessage("");

      const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, metadata, created_at")
        .eq("entity_type", "job")
        .eq("entity_id", workOrderId)
        .order("created_at", { ascending: false });

      if (error) {
        setActivityErrorMessage(error.message);
        setIsLoadingActivities(false);
        return;
      }

      setActivities((data ?? []) as ActivityEntry[]);
      setIsLoadingActivities(false);
    }

    void loadPage();
  }, [workOrderId]);

  async function reloadPhotos() {
    if (!workOrderId) {
      return;
    }

    setIsLoadingPhotos(true);

    const { data, error } = await supabase
      .from("job_photos")
      .select(`
        id,
        photo_url,
        photo_type,
        caption,
        client_visible,
        created_at
      `)
      .eq("job_id", workOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      setPhotoErrorMessage(error.message);
      setIsLoadingPhotos(false);
      return;
    }

    const signedPhotos = await hydrateJobPhotosWithSignedUrls(
      (data ?? []) as JobPhoto[],
    );

    setPhotos(signedPhotos);
    setIsLoadingPhotos(false);
  }

  async function reloadActivities() {
    if (!workOrderId) {
      return;
    }

    setIsLoadingActivities(true);

    const { data, error } = await supabase
      .from("activity_log")
      .select("id, action, metadata, created_at")
      .eq("entity_type", "job")
      .eq("entity_id", workOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      setActivityErrorMessage(error.message);
      setIsLoadingActivities(false);
      return;
    }

    setActivities((data ?? []) as ActivityEntry[]);
    setIsLoadingActivities(false);
  }

  async function reloadJobTime() {
    if (!workOrderId) {
      return;
    }

    setIsLoadingJobTime(true);

    const { data, error } = await supabase
      .from("employee_timeclock")
      .select(`
        id,
        clock_in_time,
        clock_out_time,
        activity_type,
        status
      `)
      .eq("entry_type", "job")
      .eq("job_id", workOrderId)
      .order("clock_in_time", { ascending: false });

    if (error) {
      setActivityErrorMessage(error.message);
      setIsLoadingJobTime(false);
      return;
    }

    setJobTimeEntries(
      (data ?? []) as JobTimeEntry[],
    );
    setIsLoadingJobTime(false);
  }

  async function getAuthorizedProfileId() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      throw new Error("Your login session expired. Sign in again.");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error(
        profileError?.message || "Your profile could not be verified.",
      );
    }

    if (!["admin", "manager"].includes(profile.role)) {
      throw new Error(
        "Only an administrator or manager can review completion requests.",
      );
    }

    return profile.id as string;
  }

  async function reloadWorkOrder() {
    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        property_id,
        job_title,
        description,
        job_status,
        priority,
        scheduled_start,
        estimated_price,
        materials_cost,
        created_at,
        clients (
          client_name
        ),
        properties (
          property_name,
          street_address,
          city,
          state,
          zip_code
        ),
        services (
          service_name
        ),
        employees (
          full_name
        )
      `)
      .eq("id", workOrderId)
      .single();

    if (error) {
      throw error;
    }

    setWorkOrder(data as unknown as WorkOrder);
  }

  async function handleCompletionReview(
    nextStatus: "completed" | "needs_follow_up",
  ) {
    if (!workOrder || isReviewingCompletion) {
      return;
    }

    if (workOrder.job_status !== "completion_requested") {
      setActivityErrorMessage(
        "This work order is not awaiting completion approval.",
      );
      return;
    }

    const reviewNote = completionReviewNote.trim();

    const completionRequest = activities.find(
      (activity) =>
        activity.action ===
        "technician_completion_requested",
    );
    const completionPhotoCount = photos.filter(
      (photo) => photo.photo_type === "completion",
    ).length;
    const closedJobTimeCount = jobTimeEntries.filter(
      (entry) => Boolean(entry.clock_out_time),
    ).length;
    const hasOpenJobTimer = jobTimeEntries.some(
      (entry) => !entry.clock_out_time,
    );
    const hasEstimatedPrice =
      workOrder.estimated_price !== null &&
      workOrder.estimated_price > 0;
    const materialsReviewed =
      workOrder.materials_cost !== null;

    if (
      nextStatus === "completed" &&
      (
        !completionRequest ||
        completionPhotoCount === 0 ||
        closedJobTimeCount === 0 ||
        hasOpenJobTimer ||
        !hasEstimatedPrice ||
        !materialsReviewed
      )
    ) {
      setActivityErrorMessage(
        "This work order is not ready for approval. Complete every readiness requirement first.",
      );
      return;
    }

    if (nextStatus === "needs_follow_up" && !reviewNote) {
      setActivityErrorMessage(
        "Enter a return note explaining what needs follow-up.",
      );
      return;
    }

    if (
      nextStatus === "completed" &&
      !window.confirm(
        "Approve this completion request and mark the work order completed?",
      )
    ) {
      return;
    }

    setIsReviewingCompletion(true);
    setActivityErrorMessage("");
    setActivitySuccessMessage("");

    try {
      const profileId = await getAuthorizedProfileId();

      const { error: updateError } = await supabase
        .from("jobs")
        .update({
          job_status: nextStatus,
        })
        .eq("id", workOrderId)
        .eq("job_status", "completion_requested");

      if (updateError) {
        throw updateError;
      }

      const approved = nextStatus === "completed";
      const action = approved
        ? "admin_completion_approved"
        : "admin_completion_returned";

      const message = approved
        ? reviewNote
          ? `Completion approved by admin. Review note: ${reviewNote}`
          : "Completion approved by admin."
        : `Completion returned for follow-up: ${reviewNote}`;

      const { error: activityError } = await supabase
        .from("activity_log")
        .insert({
          actor_profile_id: profileId,
          action,
          activity_type: "work_order_updated",
          entity_type: "job",
          entity_id: workOrderId,
          metadata: {
            label: approved
              ? "Completion Approved"
              : "Returned for Follow-Up",
            old_value: "completion_requested",
            new_value: nextStatus,
            note: reviewNote || null,
            message,
          },
        });

      if (activityError) {
        throw activityError;
      }

      setCompletionReviewNote("");
      setActivitySuccessMessage(
        approved
          ? "Completion approved. The work order is now completed."
          : "The work order was returned to the technician for follow-up.",
      );

      await Promise.all([
        reloadWorkOrder(),
        reloadActivities(),
        reloadPhotos(),
        reloadJobTime(),
      ]);
    } catch (error) {
      setActivityErrorMessage(
        error instanceof Error
          ? error.message
          : "The completion review could not be saved.",
      );
    } finally {
      setIsReviewingCompletion(false);
    }
  }

  async function logActivity(
    action: string,
    metadata: ActivityEntry["metadata"] = null,
  ) {
    if (!workOrderId) {
      return;
    }

    const { error } = await supabase.from("activity_log").insert({
      actor_profile_id: null,
      action,
      entity_type: "job",
      entity_id: workOrderId,
      metadata,
    });

    if (error) {
      setActivityErrorMessage(error.message);
      return;
    }

    await reloadActivities();
  }

  async function handleAddInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const note = internalNote.trim();

    setActivityErrorMessage("");
    setActivitySuccessMessage("");

    if (!note) {
      setActivityErrorMessage("Enter an internal note.");
      return;
    }

    setIsSavingNote(true);

    const { error } = await supabase.from("activity_log").insert({
      actor_profile_id: null,
      action: "internal_note_added",
      entity_type: "job",
      entity_id: workOrderId,
      metadata: { note },
    });

    if (error) {
      setActivityErrorMessage(error.message);
      setIsSavingNote(false);
      return;
    }

    setInternalNote("");
    setActivitySuccessMessage("Internal note added.");
    await reloadActivities();
    setIsSavingNote(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setPhotoErrorMessage("");
    setPhotoSuccessMessage("");

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoErrorMessage("Select an image file.");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    const maximumFileSize = 10 * 1024 * 1024;

    if (file.size > maximumFileSize) {
      setPhotoErrorMessage("The image must be 10 MB or smaller.");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPhotoErrorMessage("");
    setPhotoSuccessMessage("");

    if (!selectedFile) {
      setPhotoErrorMessage("Select a photo to upload.");
      return;
    }

    if (!workOrderId) {
      setPhotoErrorMessage("The work-order ID is missing.");
      return;
    }

    setIsUploading(true);

    const originalExtension =
      selectedFile.name.split(".").pop()?.toLowerCase() || "jpg";

    const safeExtension = originalExtension.replace(/[^a-z0-9]/g, "") || "jpg";
    const uniqueFileName = `${crypto.randomUUID()}.${safeExtension}`;
    const storagePath = `${workOrderId}/${photoType}/${uniqueFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("job-photos")
      .upload(storagePath, selectedFile, {
        cacheControl: "3600",
        contentType: selectedFile.type,
        upsert: false,
      });

    if (uploadError) {
      setPhotoErrorMessage(uploadError.message);
      setIsUploading(false);
      return;
    }

    const { error: recordError } = await supabase
      .from("job_photos")
      .insert({
        job_id: workOrderId,
        property_id: workOrder?.property_id || null,
        uploaded_by: null,
        photo_url: storagePath,
        photo_type: photoType,
        caption: caption.trim() || null,
        client_visible: false,
      });

    if (recordError) {
      await supabase.storage.from("job-photos").remove([storagePath]);

      setPhotoErrorMessage(recordError.message);
      setIsUploading(false);
      return;
    }

    await logActivity("photo_uploaded", {
      photo_type: photoType,
      caption: caption.trim() || null,
      client_visible: false,
    });

    setSelectedFile(null);
    setCaption("");
    setPhotoType("before");
    setShowPhotoForm(false);
    setPhotoSuccessMessage("Photo uploaded successfully.");

    const fileInput = document.getElementById(
      "jobPhotoFile",
    ) as HTMLInputElement | null;

    if (fileInput) {
      fileInput.value = "";
    }

    await reloadPhotos();

    setIsUploading(false);
  }


  function getStoragePathFromPhotoUrl(photoUrl: string) {
    if (!photoUrl) {
      return null;
    }

    const publicMarker = "/storage/v1/object/public/job-photos/";
    const signedMarker = "/storage/v1/object/sign/job-photos/";

    for (const marker of [publicMarker, signedMarker]) {
      const markerIndex = photoUrl.indexOf(marker);

      if (markerIndex !== -1) {
        const encodedPath = photoUrl
          .slice(markerIndex + marker.length)
          .split("?")[0];

        try {
          return decodeURIComponent(encodedPath);
        } catch {
          return encodedPath;
        }
      }
    }

    if (!photoUrl.startsWith("http://") && !photoUrl.startsWith("https://")) {
      return photoUrl;
    }

    return null;
  }

  async function handleClientVisibilityChange(photo: JobPhoto) {
    setPhotoErrorMessage("");
    setPhotoSuccessMessage("");
    setUpdatingPhotoId(photo.id);

    const nextVisibility = !Boolean(photo.client_visible);

    const { error } = await supabase
      .from("job_photos")
      .update({ client_visible: nextVisibility })
      .eq("id", photo.id);

    if (error) {
      setPhotoErrorMessage(error.message);
      setUpdatingPhotoId(null);
      return;
    }

    setPhotos((currentPhotos) =>
      currentPhotos.map((currentPhoto) =>
        currentPhoto.id === photo.id
          ? {
              ...currentPhoto,
              client_visible: nextVisibility,
            }
          : currentPhoto,
      ),
    );

    await logActivity("photo_visibility_changed", {
      photo_type: photo.photo_type || undefined,
      caption: photo.caption,
      client_visible: nextVisibility,
    });

    setPhotoSuccessMessage(
      nextVisibility
        ? "Photo is now visible to the client."
        : "Photo is now internal only.",
    );

    setUpdatingPhotoId(null);
  }

  async function handleDeletePhoto(photo: JobPhoto) {
    const confirmed = window.confirm(
      "Delete this photo permanently? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setPhotoErrorMessage("");
    setPhotoSuccessMessage("");
    setDeletingPhotoId(photo.id);

    const storagePath =
      photo.storage_path ??
      getStoragePathFromPhotoUrl(photo.photo_url);

    if (!storagePath) {
      setPhotoErrorMessage(
        "The Storage path could not be determined from this photo URL.",
      );
      setDeletingPhotoId(null);
      return;
    }

    const { error: storageError } = await supabase.storage
      .from("job-photos")
      .remove([storagePath]);

    if (storageError) {
      setPhotoErrorMessage(storageError.message);
      setDeletingPhotoId(null);
      return;
    }

    const { error: recordError } = await supabase
      .from("job_photos")
      .delete()
      .eq("id", photo.id);

    if (recordError) {
      setPhotoErrorMessage(
        `The Storage file was deleted, but the database record could not be removed: ${recordError.message}`,
      );
      setDeletingPhotoId(null);
      await reloadPhotos();
      return;
    }

    setPhotos((currentPhotos) =>
      currentPhotos.filter((currentPhoto) => currentPhoto.id !== photo.id),
    );

    await logActivity("photo_deleted", {
      photo_type: photo.photo_type || undefined,
      caption: photo.caption,
      client_visible: Boolean(photo.client_visible),
    });

    setPhotoSuccessMessage("Photo deleted successfully.");
    setDeletingPhotoId(null);
  }

  function formatActivityAction(action: string) {
    const labels: Record<string, string> = {
      internal_note_added: "Internal note",
      photo_uploaded: "Photo uploaded",
      photo_deleted: "Photo deleted",
      photo_visibility_changed: "Photo visibility changed",
      work_order_created: "Work order created",
      work_order_updated: "Work order updated",
      technician_completion_requested: "Completion requested",
      admin_completion_approved: "Completion approved",
      admin_completion_returned: "Returned for follow-up",
    };

    return (
      labels[action] ||
      action
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    );
  }

  function getActivityDescription(activity: ActivityEntry) {
    const metadata = activity.metadata;

    if (activity.action === "internal_note_added") {
      return metadata?.note || "Internal note added.";
    }

    if (activity.action === "photo_uploaded") {
      const type = formatPhotoType(metadata?.photo_type || null);
      return metadata?.caption
        ? `${type}: ${metadata.caption}`
        : `${type} photo uploaded.`;
    }

    if (activity.action === "photo_deleted") {
      const type = formatPhotoType(metadata?.photo_type || null);
      return metadata?.caption
        ? `${type}: ${metadata.caption}`
        : `${type} photo deleted.`;
    }

    if (activity.action === "photo_visibility_changed") {
      return metadata?.client_visible
        ? "Photo marked visible to the client."
        : "Photo changed to internal only.";
    }

    if (
      activity.action === "technician_completion_requested" ||
      activity.action === "admin_completion_approved" ||
      activity.action === "admin_completion_returned"
    ) {
      return (
        metadata?.message ||
        metadata?.note ||
        "Completion workflow updated."
      );
    }

    return metadata?.message || "Work-order activity recorded.";
  }

  function formatStatus(status: string | null) {
    if (!status) {
      return "New";
    }

    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatPhotoType(type: string | null) {
    if (!type) {
      return "Job Photo";
    }

    return type
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatDate(value: string | null) {
    if (!value) {
      return "Not scheduled";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Invalid date";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatShortDate(value: string | null) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatDuration(totalMinutes: number) {
    const roundedMinutes = Math.round(totalMinutes);
    const hours = Math.floor(roundedMinutes / 60);
    const minutes = roundedMinutes % 60;

    if (hours === 0) {
      return `${minutes} min`;
    }

    if (minutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${minutes} min`;
  }

  function formatPrice(value: number | null) {
    if (value === null || value === undefined) {
      return "Not entered";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-bold">Loading work order...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div>
        <Link
          href="/work-orders"
          className="text-sm font-black text-bakerssPink"
        >
          ← Back to Work Orders
        </Link>

        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div>
        <Link
          href="/work-orders"
          className="text-sm font-black text-bakerssPink"
        >
          ← Back to Work Orders
        </Link>

        <div className="mt-6 rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black">Work order not found</h1>
        </div>
      </div>
    );
  }

  const completionRequest = activities.find(
    (activity) =>
      activity.action ===
      "technician_completion_requested",
  );
  const completionPhotoCount = photos.filter(
    (photo) => photo.photo_type === "completion",
  ).length;
  const closedJobTimeEntries = jobTimeEntries.filter(
    (entry) => Boolean(entry.clock_out_time),
  );
  const hasOpenJobTimer = jobTimeEntries.some(
    (entry) => !entry.clock_out_time,
  );
  const totalJobMinutes = closedJobTimeEntries.reduce(
    (total, entry) => {
      if (!entry.clock_out_time) {
        return total;
      }

      const clockIn = new Date(
        entry.clock_in_time,
      ).getTime();
      const clockOut = new Date(
        entry.clock_out_time,
      ).getTime();

      if (
        Number.isNaN(clockIn) ||
        Number.isNaN(clockOut)
      ) {
        return total;
      }

      return total + Math.max(0, clockOut - clockIn) / 60000;
    },
    0,
  );
  const completionReadiness = [
    {
      label: "Technician completion note submitted",
      ready: Boolean(completionRequest),
      detail: completionRequest
        ? "Completion request is documented."
        : "Technician must submit a completion request.",
    },
    {
      label: "Completion photo uploaded",
      ready: completionPhotoCount > 0,
      detail:
        completionPhotoCount > 0
          ? `${completionPhotoCount} completion photo${
              completionPhotoCount === 1 ? "" : "s"
            } available.`
          : "At least one completion photo is required.",
    },
    {
      label: "Production time recorded",
      ready: closedJobTimeEntries.length > 0,
      detail:
        closedJobTimeEntries.length > 0
          ? `${formatDuration(
              totalJobMinutes,
            )} recorded across ${
              closedJobTimeEntries.length
            } closed time entr${
              closedJobTimeEntries.length === 1
                ? "y"
                : "ies"
            }.`
          : "At least one completed job-time entry is required.",
    },
    {
      label: "No active job timer",
      ready: !hasOpenJobTimer,
      detail: hasOpenJobTimer
        ? "A technician is still clocked into this work order."
        : "All job timers are closed.",
    },
    {
      label: "Billing amount entered",
      ready:
        workOrder.estimated_price !== null &&
        workOrder.estimated_price > 0,
      detail:
        workOrder.estimated_price !== null &&
        workOrder.estimated_price > 0
          ? `${formatPrice(
              workOrder.estimated_price,
            )} billing amount recorded.`
          : "Enter an estimated price before approval.",
    },
    {
      label: "Materials cost reviewed",
      ready: workOrder.materials_cost !== null,
      detail:
        workOrder.materials_cost !== null
          ? `${formatPrice(
              workOrder.materials_cost,
            )} materials cost recorded.`
          : "Enter materials cost, including $0.00 when no materials were used.",
    },
  ];
  const readyRequirementCount =
    completionReadiness.filter(
      (item) => item.ready,
    ).length;
  const isCompletionReady =
    readyRequirementCount === completionReadiness.length;

  const propertyAddress = [
    workOrder.properties?.street_address,
    workOrder.properties?.city,
    workOrder.properties?.state,
    workOrder.properties?.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Link
            href="/work-orders"
            className="text-sm font-black text-bakerssPink transition hover:opacity-70"
          >
            ← Back to Work Orders
          </Link>

          <h1 className="mt-3 text-3xl font-black">
            {workOrder.job_title}
          </h1>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">
              {formatStatus(workOrder.job_status)}
            </span>

            <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-black uppercase text-bakerssPink">
              {workOrder.priority || "normal"} priority
            </span>
          </div>
        </div>

        <Link
          href={`/work-orders/${workOrder.id}/edit`}
          className="rounded-xl bg-bakerssPink px-5 py-3 text-center text-sm font-black text-white shadow-sm transition hover:opacity-90"
        >
          Edit Work Order
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Job Description</h2>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-700">
              {workOrder.description || "No job description was entered."}
            </p>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Property</h2>

            <div className="mt-4">
              <p className="font-black text-gray-900">
                {workOrder.properties?.property_name ||
                  workOrder.properties?.street_address ||
                  "No property selected"}
              </p>

              {propertyAddress && (
                <p className="mt-2 text-sm text-gray-600">
                  {propertyAddress}
                </p>
              )}
            </div>
          </section>

          {workOrder.job_status === "completion_requested" && (
            <section className="rounded-2xl border border-purple-200 bg-purple-50 p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-purple-700">
                    Admin Review Required
                  </p>

                  <h2 className="mt-1 text-xl font-black text-purple-950">
                    Completion Requested
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-purple-800">
                    Review every completion requirement before approving
                    the work order for billing.
                  </p>
                </div>

                <span className="rounded-full bg-purple-700 px-4 py-2 text-xs font-black uppercase text-white">
                  Awaiting Approval
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-purple-200 bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-purple-700">
                      Completion Readiness
                    </p>

                    <h3 className="mt-1 text-lg font-black text-purple-950">
                      {readyRequirementCount} of{" "}
                      {completionReadiness.length} Requirements Complete
                    </h3>
                  </div>

                  <span
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase ${
                      isCompletionReady
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isCompletionReady
                      ? "Ready to Approve"
                      : "Action Required"}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {completionReadiness.map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-xl border p-4 ${
                        item.ready
                          ? "border-green-200 bg-green-50"
                          : "border-red-200 bg-red-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                            item.ready
                              ? "bg-green-700 text-white"
                              : "bg-red-700 text-white"
                          }`}
                        >
                          {item.ready ? "✓" : "!"}
                        </span>

                        <div>
                          <p
                            className={`font-black ${
                              item.ready
                                ? "text-green-950"
                                : "text-red-950"
                            }`}
                          >
                            {item.label}
                          </p>

                          <p
                            className={`mt-1 text-sm font-bold ${
                              item.ready
                                ? "text-green-800"
                                : "text-red-800"
                            }`}
                          >
                            {item.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {isLoadingJobTime && (
                  <p className="mt-4 text-sm font-bold text-gray-500">
                    Refreshing production-time records…
                  </p>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-purple-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Technician Completion Note
                </p>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                  {activities.find(
                    (activity) =>
                      activity.action ===
                      "technician_completion_requested",
                  )?.metadata?.note ||
                    activities.find(
                      (activity) =>
                        activity.action ===
                        "technician_completion_requested",
                    )?.metadata?.message ||
                    "No completion note was found in the activity history."}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Completion Photos
                </p>

                {photos.filter(
                  (photo) => photo.photo_type === "completion",
                ).length === 0 ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                    No completion photos are available. Return the work order
                    for follow-up.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {photos
                      .filter(
                        (photo) =>
                          photo.photo_type === "completion",
                      )
                      .map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-xl border bg-white"
                        >
                          <img
                            src={photo.photo_url}
                            alt={
                              photo.caption ||
                              "Technician completion photo"
                            }
                            className="h-52 w-full object-cover"
                          />

                          <div className="p-3">
                            <p className="text-sm font-bold text-gray-800">
                              {photo.caption || "Completion photo"}
                            </p>
                          </div>
                        </a>
                      ))}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <label
                  htmlFor="completionReviewNote"
                  className="mb-2 block text-sm font-black text-purple-950"
                >
                  Admin Review Note
                </label>

                <textarea
                  id="completionReviewNote"
                  value={completionReviewNote}
                  onChange={(event) =>
                    setCompletionReviewNote(event.target.value)
                  }
                  rows={4}
                  placeholder="Optional when approving. Required when returning the work order for follow-up."
                  className="w-full resize-y rounded-xl border border-purple-200 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleCompletionReview("needs_follow_up")
                  }
                  disabled={isReviewingCompletion}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {isReviewingCompletion
                    ? "Saving..."
                    : "Return for Follow-Up"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleCompletionReview("completed")
                  }
                  disabled={
                    isReviewingCompletion ||
                    !isCompletionReady
                  }
                  className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isReviewingCompletion
                    ? "Saving..."
                    : "Approve Completion"}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-black">Internal Notes & Activity</h2>
              <p className="mt-1 text-sm text-gray-500">
                Record private notes and review the work-order history.
              </p>
            </div>

            {activityErrorMessage && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {activityErrorMessage}
              </div>
            )}

            {activitySuccessMessage && (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
                {activitySuccessMessage}
              </div>
            )}

            <form
              onSubmit={handleAddInternalNote}
              className="mt-5 rounded-2xl border bg-gray-50 p-5"
            >
              <label
                htmlFor="internalNote"
                className="mb-2 block text-sm font-black text-gray-800"
              >
                Add Internal Note
              </label>

              <textarea
                id="internalNote"
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                rows={4}
                placeholder="Add access instructions, customer concerns, material updates, technician notes, or follow-up details."
                className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3"
              />

              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingNote}
                  className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingNote ? "Saving Note..." : "Add Note"}
                </button>
              </div>
            </form>

            <div className="mt-6">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-500">
                Activity History
              </h3>

              {isLoadingActivities ? (
                <div className="mt-4 rounded-xl border border-dashed bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  Loading activity...
                </div>
              ) : activities.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  No activity has been recorded.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {activities.map((activity) => (
                    <article
                      key={activity.id}
                      className="rounded-xl border bg-white p-4"
                    >
                      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                        <p className="text-sm font-black text-gray-900">
                          {formatActivityAction(activity.action)}
                        </p>

                        <p className="text-xs font-semibold text-gray-500">
                          {formatShortDate(activity.created_at)}
                        </p>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {getActivityDescription(activity)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-black">Job Photos</h2>

                <p className="mt-1 text-sm text-gray-500">
                  Upload before, progress, and completion photos.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowPhotoForm((current) => !current);
                  setPhotoErrorMessage("");
                  setPhotoSuccessMessage("");
                }}
                className="rounded-xl bg-bakerssPink px-4 py-2 text-sm font-black text-white transition hover:opacity-90"
              >
                {showPhotoForm ? "Close Upload Form" : "Add Photo"}
              </button>
            </div>

            {photoErrorMessage && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {photoErrorMessage}
              </div>
            )}

            {photoSuccessMessage && (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
                {photoSuccessMessage}
              </div>
            )}

            {showPhotoForm && (
              <form
                onSubmit={handlePhotoUpload}
                className="mt-5 space-y-5 rounded-2xl border bg-gray-50 p-5"
              >
                <div>
                  <label
                    htmlFor="jobPhotoFile"
                    className="mb-2 block text-sm font-black text-gray-800"
                  >
                    Photo
                  </label>

                  <input
                    id="jobPhotoFile"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                    required
                  />

                  <p className="mt-2 text-xs text-gray-500">
                    JPG, PNG, WEBP, HEIC, or another image format. Maximum
                    size: 10 MB.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="photoType"
                      className="mb-2 block text-sm font-black text-gray-800"
                    >
                      Photo Type
                    </label>

                    <select
                      id="photoType"
                      value={photoType}
                      onChange={(event) =>
                        setPhotoType(event.target.value as PhotoType)
                      }
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                    >
                      <option value="before">Before</option>
                      <option value="progress">Progress</option>
                      <option value="completion">Completion</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="photoCaption"
                      className="mb-2 block text-sm font-black text-gray-800"
                    >
                      Caption
                    </label>

                    <input
                      id="photoCaption"
                      type="text"
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="Optional description"
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploading ? "Uploading Photo..." : "Upload Photo"}
                  </button>
                </div>
              </form>
            )}

            {isLoadingPhotos ? (
              <div className="mt-5 rounded-xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                Loading photos...
              </div>
            ) : photos.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
                No photos have been uploaded.
              </div>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {photos.map((photo) => (
                  <article
                    key={photo.id}
                    className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                  >
                    <a
                      href={photo.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={photo.photo_url}
                        alt={
                          photo.caption ||
                          `${formatPhotoType(photo.photo_type)} job photo`
                        }
                        className="h-64 w-full object-cover transition hover:opacity-90"
                      />
                    </a>

                    <div className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-black uppercase text-bakerssPink">
                          {formatPhotoType(photo.photo_type)}
                        </span>

                        {photo.created_at && (
                          <span className="text-xs font-semibold text-gray-500">
                            {formatShortDate(photo.created_at)}
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-sm text-gray-700">
                        {photo.caption || "No caption"}
                      </p>

                      <p
                        className={`mt-2 text-xs font-black ${
                          photo.client_visible
                            ? "text-green-700"
                            : "text-gray-500"
                        }`}
                      >
                        {photo.client_visible
                          ? "Visible to client"
                          : "Internal photo"}
                      </p>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleClientVisibilityChange(photo)
                          }
                          disabled={
                            updatingPhotoId === photo.id ||
                            deletingPhotoId === photo.id
                          }
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingPhotoId === photo.id
                            ? "Updating..."
                            : photo.client_visible
                              ? "Make Internal"
                              : "Show to Client"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeletePhoto(photo)}
                          disabled={
                            deletingPhotoId === photo.id ||
                            updatingPhotoId === photo.id
                          }
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingPhotoId === photo.id
                            ? "Deleting..."
                            : "Delete Photo"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {workOrder.job_status === "completed" && (
            <section className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-green-700">
                Completion Control
              </p>

              <h2 className="mt-2 text-lg font-black text-green-950">
                Manager Approved
              </h2>

              <p className="mt-2 text-sm font-bold leading-6 text-green-800">
                Documentation, time, materials, and billing
                readiness were reviewed before completion.
              </p>
            </section>
          )}

          {workOrder.job_status === "completed" && (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                Billing
              </p>

              {isLoadingInvoiceLink ? (
                <div className="mt-4 rounded-xl border border-dashed bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">
                  Checking invoice status...
                </div>
              ) : linkedInvoice?.invoices ? (
                <div className="mt-4">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-green-700">
                      Already Invoiced
                    </p>

                    <p className="mt-2 text-lg font-black text-green-950">
                      {linkedInvoice.invoices.invoice_number || "Invoice"}
                    </p>

                    <p className="mt-1 text-sm font-bold text-green-800">
                      {formatStatus(
                        linkedInvoice.invoices.invoice_status,
                      )}
                    </p>
                  </div>

                  <Link
                    href={`/invoices/${linkedInvoice.invoices.id}`}
                    className="mt-4 block w-full rounded-xl bg-gray-950 px-4 py-3 text-center text-sm font-black text-white transition hover:opacity-90"
                  >
                    View Invoice
                  </Link>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm leading-6 text-gray-600">
                    This completed work order has not been invoiced.
                  </p>

                  <Link
                    href={`/invoices/new?jobId=${workOrder.id}`}
                    className="mt-4 block w-full rounded-xl bg-bakerssPink px-4 py-3 text-center text-sm font-black text-white transition hover:opacity-90"
                  >
                    Create Invoice
                  </Link>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">Work Order Details</h2>

            <dl className="mt-5 space-y-5">
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Customer
                </dt>

                <dd className="mt-1 font-bold text-gray-900">
                  {workOrder.clients?.client_name || "No customer"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Service
                </dt>

                <dd className="mt-1 font-bold text-gray-900">
                  {workOrder.services?.service_name || "No service"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Assigned Employee
                </dt>

                <dd className="mt-1 font-bold text-gray-900">
                  {workOrder.employees?.full_name || "Unassigned"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Scheduled Start
                </dt>

                <dd className="mt-1 font-bold text-gray-900">
                  {formatDate(workOrder.scheduled_start)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Estimated Price
                </dt>

                <dd className="mt-1 text-xl font-black text-gray-900">
                  {formatPrice(workOrder.estimated_price)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-gray-500">
                  Created
                </dt>

                <dd className="mt-1 font-bold text-gray-900">
                  {formatDate(workOrder.created_at)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}