"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase/client";

type Client = {
  id: string;
  client_name: string;
};

type Property = {
  id: string;
  client_id: string | null;
  property_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
};

type Service = {
  id: string;
  service_name: string;
};

type Job = {
  id: string;
  client_id: string | null;
  property_id: string | null;
  service_id: string | null;
  job_title: string;
  job_status: string | null;
  estimated_price: number | null;
};

type InvoicedJobLink = {
  job_id: string | null;
};

type LineItemForm = {
  rowId: string;
  jobId: string;
  serviceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type InvoiceForm = {
  clientId: string;
  propertyId: string;
  issueDate: string;
  dueDate: string;
  discountType: "fixed" | "percentage";
  discountValue: string;
  taxRate: string;
  paymentTerms: string;
  customerNotes: string;
  internalNotes: string;
};

const emptyInvoiceForm: InvoiceForm = {
  clientId: "",
  propertyId: "",
  issueDate: getTodayInput(),
  dueDate: getDefaultDueDateInput(),
  discountType: "fixed",
  discountValue: "0",
  taxRate: "0",
  paymentTerms: "Due within 5 days",
  customerNotes: "",
  internalNotes: "",
};

export default function NewInvoicePage() {
  const router = useRouter();
  const [requestedJobId, setRequestedJobId] = useState("");

  const [form, setForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [lineItems, setLineItems] = useState<LineItemForm[]>([
    createEmptyLineItem(),
  ]);

  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoicedJobIds, setInvoicedJobIds] = useState<Set<string>>(
    new Set(),
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("jobId") ?? "";
    setRequestedJobId(jobId);
  }, []);

  useEffect(() => {
    async function loadPage() {
      setIsLoading(true);
      setErrorMessage("");

      const [
        clientsResponse,
        propertiesResponse,
        servicesResponse,
        jobsResponse,
        invoicedJobsResponse,
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id, client_name")
          .order("client_name", { ascending: true }),

        supabase
          .from("properties")
          .select(`
            id,
            client_id,
            property_name,
            street_address,
            city,
            state
          `)
          .order("property_name", { ascending: true }),

        supabase
          .from("services")
          .select("id, service_name")
          .order("service_name", { ascending: true }),

        supabase
          .from("jobs")
          .select(`
            id,
            client_id,
            property_id,
            service_id,
            job_title,
            job_status,
            estimated_price
          `)
          .eq("job_status", "completed")
          .order("scheduled_start", {
            ascending: false,
            nullsFirst: false,
          }),

        supabase
          .from("invoice_line_items")
          .select("job_id")
          .not("job_id", "is", null),
      ]);

      const firstError =
        clientsResponse.error ||
        propertiesResponse.error ||
        servicesResponse.error ||
        jobsResponse.error ||
        invoicedJobsResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setClients((clientsResponse.data ?? []) as Client[]);
      setProperties((propertiesResponse.data ?? []) as Property[]);
      setServices((servicesResponse.data ?? []) as Service[]);

      const existingInvoicedJobIds = new Set(
        ((invoicedJobsResponse.data ?? []) as InvoicedJobLink[])
          .map((item) => item.job_id)
          .filter((jobId): jobId is string => Boolean(jobId)),
      );

      setInvoicedJobIds(existingInvoicedJobIds);
      setJobs(
        ((jobsResponse.data ?? []) as Job[]).filter(
          (job) => !existingInvoicedJobIds.has(job.id),
        ),
      );
      setIsLoading(false);
    }

    void loadPage();
  }, []);

  useEffect(() => {
    if (isLoading || !requestedJobId) return;

    const selectedJob = jobs.find((job) => job.id === requestedJobId);
    if (!selectedJob) return;

    setForm((current) => ({
      ...current,
      clientId: selectedJob.client_id ?? current.clientId,
      propertyId: selectedJob.property_id ?? current.propertyId,
    }));

    setLineItems((current) => {
      if (current.some((lineItem) => lineItem.jobId === selectedJob.id)) {
        return current;
      }

      const prefilled = {
        rowId: current[0]?.rowId ?? createEmptyLineItem().rowId,
        jobId: selectedJob.id,
        serviceId: selectedJob.service_id ?? "",
        description: selectedJob.job_title,
        quantity: "1",
        unitPrice:
          selectedJob.estimated_price === null || selectedJob.estimated_price === undefined
            ? ""
            : String(selectedJob.estimated_price),
      };

      if (current.length === 1 && !current[0].jobId && !current[0].description) {
        return [prefilled];
      }

      return [prefilled, ...current];
    });
  }, [isLoading, jobs, requestedJobId]);

  const filteredProperties = useMemo(() => {
    if (!form.clientId) {
      return properties;
    }

    return properties.filter(
      (property) => property.client_id === form.clientId,
    );
  }, [form.clientId, properties]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (form.clientId && job.client_id !== form.clientId) {
        return false;
      }

      if (form.propertyId && job.property_id !== form.propertyId) {
        return false;
      }

      if (job.job_status !== "completed") {
        return false;
      }

      if (invoicedJobIds.has(job.id)) {
        return false;
      }

      return true;
    });
  }, [form.clientId, form.propertyId, invoicedJobIds, jobs]);

  const calculatedTotals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, lineItem) => {
      const quantity = Number(lineItem.quantity);
      const unitPrice = Number(lineItem.unitPrice);

      if (
        !Number.isFinite(quantity) ||
        !Number.isFinite(unitPrice)
      ) {
        return sum;
      }

      return sum + quantity * unitPrice;
    }, 0);

    const discountValue = Number(form.discountValue) || 0;

    const discountAmount =
      form.discountType === "percentage"
        ? subtotal * Math.min(Math.max(discountValue, 0), 100) / 100
        : Math.min(Math.max(discountValue, 0), subtotal);

    const taxableAmount = Math.max(
      subtotal - discountAmount,
      0,
    );

    const taxRate = Number(form.taxRate) || 0;
    const taxAmount =
      taxableAmount * Math.max(taxRate, 0) / 100;

    return {
      subtotal,
      discountAmount,
      taxAmount,
      total: taxableAmount + taxAmount,
    };
  }, [
    form.discountType,
    form.discountValue,
    form.taxRate,
    lineItems,
  ]);

  function updateFormField<K extends keyof InvoiceForm>(
    field: K,
    value: InvoiceForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleClientChange(clientId: string) {
    setForm((current) => {
      const currentProperty = properties.find(
        (property) => property.id === current.propertyId,
      );

      return {
        ...current,
        clientId,
        propertyId:
          currentProperty?.client_id === clientId
            ? current.propertyId
            : "",
      };
    });

    setLineItems((current) =>
      current.map((lineItem) => ({
        ...lineItem,
        jobId: "",
      })),
    );
  }

  function handlePropertyChange(propertyId: string) {
    updateFormField("propertyId", propertyId);

    setLineItems((current) =>
      current.map((lineItem) => ({
        ...lineItem,
        jobId: "",
      })),
    );
  }

  function updateLineItem(
    rowId: string,
    field: keyof Omit<LineItemForm, "rowId">,
    value: string,
  ) {
    setLineItems((current) =>
      current.map((lineItem) =>
        lineItem.rowId === rowId
          ? {
              ...lineItem,
              [field]: value,
            }
          : lineItem,
      ),
    );
  }

  function handleJobSelection(
    rowId: string,
    jobId: string,
  ) {
    const selectedJob = jobs.find((job) => job.id === jobId);

    if (
      jobId &&
      lineItems.some(
        (lineItem) =>
          lineItem.rowId !== rowId &&
          lineItem.jobId === jobId,
      )
    ) {
      setErrorMessage(
        "That completed work order is already selected on this invoice.",
      );
      return;
    }

    if (selectedJob) {
      setForm((current) => ({
        ...current,
        clientId: selectedJob.client_id || current.clientId,
        propertyId:
          selectedJob.property_id || current.propertyId,
      }));
    }

    setLineItems((current) =>
      current.map((lineItem) => {
        if (lineItem.rowId !== rowId) {
          return lineItem;
        }

        if (!selectedJob) {
          return {
            ...lineItem,
            jobId: "",
          };
        }

        return {
          ...lineItem,
          jobId: selectedJob.id,
          serviceId:
            selectedJob.service_id || lineItem.serviceId,
          description:
            selectedJob.job_title || lineItem.description,
          unitPrice:
            selectedJob.estimated_price === null ||
            selectedJob.estimated_price === undefined
              ? lineItem.unitPrice
              : String(selectedJob.estimated_price),
        };
      }),
    );

    setErrorMessage("");
  }

  function addCompletedJob(job: Job) {
    if (lineItems.some((lineItem) => lineItem.jobId === job.id)) {
      setErrorMessage(
        "That completed work order is already selected on this invoice.",
      );
      return;
    }

    setForm((current) => ({
      ...current,
      clientId: job.client_id || current.clientId,
      propertyId: job.property_id || current.propertyId,
    }));

    const newLineItem: LineItemForm = {
      rowId: crypto.randomUUID(),
      jobId: job.id,
      serviceId: job.service_id || "",
      description: job.job_title,
      quantity: "1",
      unitPrice:
        job.estimated_price === null ||
        job.estimated_price === undefined
          ? ""
          : String(job.estimated_price),
    };

    setLineItems((current) => {
      const onlyBlankLine =
        current.length === 1 &&
        !current[0].jobId &&
        !current[0].serviceId &&
        !current[0].description &&
        !current[0].unitPrice;

      return onlyBlankLine ? [newLineItem] : [...current, newLineItem];
    });

    setErrorMessage("");
  }

  function addLineItem() {
    setLineItems((current) => [
      ...current,
      createEmptyLineItem(),
    ]);
  }

  function removeLineItem(rowId: string) {
    setLineItems((current) => {
      if (current.length === 1) {
        return [createEmptyLineItem()];
      }

      return current.filter(
        (lineItem) => lineItem.rowId !== rowId,
      );
    });
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.clientId) {
      setErrorMessage("Select a customer.");
      return;
    }

    if (!form.issueDate) {
      setErrorMessage("Enter an issue date.");
      return;
    }

    if (
      form.dueDate &&
      new Date(form.dueDate) < new Date(form.issueDate)
    ) {
      setErrorMessage(
        "The due date cannot be before the issue date.",
      );
      return;
    }

    const cleanLineItems = lineItems
      .map((lineItem) => ({
        ...lineItem,
        description: lineItem.description.trim(),
        quantity: Number(lineItem.quantity),
        unitPrice: Number(lineItem.unitPrice),
      }))
      .filter(
        (lineItem) =>
          lineItem.description ||
          lineItem.quantity ||
          lineItem.unitPrice ||
          lineItem.jobId ||
          lineItem.serviceId,
      );

    if (cleanLineItems.length === 0) {
      setErrorMessage(
        "Add at least one invoice line item.",
      );
      return;
    }

    for (const lineItem of cleanLineItems) {
      if (!lineItem.description) {
        setErrorMessage(
          "Every line item must include a description.",
        );
        return;
      }

      if (
        !Number.isFinite(lineItem.quantity) ||
        lineItem.quantity <= 0
      ) {
        setErrorMessage(
          "Every line item must have a quantity greater than zero.",
        );
        return;
      }

      if (
        !Number.isFinite(lineItem.unitPrice) ||
        lineItem.unitPrice < 0
      ) {
        setErrorMessage(
          "Every line item must have a valid unit price.",
        );
        return;
      }
    }

    const selectedJobIds = cleanLineItems
      .map((lineItem) => lineItem.jobId)
      .filter((jobId): jobId is string => Boolean(jobId));

    if (new Set(selectedJobIds).size !== selectedJobIds.length) {
      setErrorMessage(
        "The same work order cannot appear more than once on an invoice.",
      );
      return;
    }

    if (selectedJobIds.length > 0) {
      const { data: existingLinks, error: existingLinksError } =
        await supabase
          .from("invoice_line_items")
          .select("job_id")
          .in("job_id", selectedJobIds);

      if (existingLinksError) {
        setErrorMessage(existingLinksError.message);
        return;
      }

      const alreadyInvoicedIds = new Set(
        ((existingLinks ?? []) as InvoicedJobLink[])
          .map((item) => item.job_id)
          .filter((jobId): jobId is string => Boolean(jobId)),
      );

      if (alreadyInvoicedIds.size > 0) {
        setErrorMessage(
          "One or more selected work orders have already been invoiced. Refresh the page and choose only available completed work orders.",
        );
        return;
      }

      const { data: completedJobs, error: completedJobsError } =
        await supabase
          .from("jobs")
          .select("id, job_status")
          .in("id", selectedJobIds);

      if (completedJobsError) {
        setErrorMessage(completedJobsError.message);
        return;
      }

      const invalidJob = (completedJobs ?? []).find(
        (job) => job.job_status !== "completed",
      );

      if (invalidJob) {
        setErrorMessage(
          "Only completed work orders can be attached to an invoice.",
        );
        return;
      }
    }

    const discountValue = Number(form.discountValue || 0);
    const taxRate = Number(form.taxRate || 0);

    if (
      !Number.isFinite(discountValue) ||
      discountValue < 0
    ) {
      setErrorMessage("Enter a valid discount.");
      return;
    }

    if (
      form.discountType === "percentage" &&
      discountValue > 100
    ) {
      setErrorMessage(
        "Percentage discounts cannot exceed 100%.",
      );
      return;
    }

    if (!Number.isFinite(taxRate) || taxRate < 0) {
      setErrorMessage("Enter a valid tax rate.");
      return;
    }

    setIsSaving(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setErrorMessage(
        "Your login session expired. Sign in again.",
      );
      setIsSaving(false);
      return;
    }

    const { data: invoiceData, error: invoiceError } =
      await supabase
        .from("invoices")
        .insert({
          client_id: form.clientId,
          property_id: form.propertyId || null,
          invoice_status: "draft",
          issue_date: form.issueDate,
          due_date: form.dueDate || null,
          discount_type: form.discountType,
          discount_value: discountValue,
          tax_rate: taxRate,
          payment_terms:
            form.paymentTerms.trim() || null,
          customer_notes:
            form.customerNotes.trim() || null,
          internal_notes:
            form.internalNotes.trim() || null,
          created_by: session.user.id,
          updated_by: session.user.id,
        })
        .select("id, invoice_number")
        .single();

    if (invoiceError || !invoiceData) {
      setErrorMessage(
        invoiceError?.message ||
          "The invoice could not be created.",
      );
      setIsSaving(false);
      return;
    }

    const invoiceId = invoiceData.id as string;

    const lineItemInsertData = cleanLineItems.map(
      (lineItem, index) => ({
        invoice_id: invoiceId,
        job_id: lineItem.jobId || null,
        service_id: lineItem.serviceId || null,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unit_price: lineItem.unitPrice,
        display_order: index,
      }),
    );

    const { error: lineItemError } = await supabase
      .from("invoice_line_items")
      .insert(lineItemInsertData);

    if (lineItemError) {
      await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId);

      setErrorMessage(
        `The invoice header was created, but the line items failed: ${lineItemError.message}`,
      );
      setIsSaving(false);
      return;
    }

    setSuccessMessage(
      `${invoiceData.invoice_number || "Invoice"} created successfully.`,
    );

    setIsSaving(false);
    router.push("/invoices");
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="font-black">
          Loading invoice form...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href="/invoices"
            className="text-sm font-black text-bakerssPink transition hover:opacity-70"
          >
            ← Back to Invoices
          </Link>

          <h1 className="mt-3 text-3xl font-black">
            Create Invoice
          </h1>

          <p className="mt-2 text-gray-600">
            Create a draft invoice with customer, property,
            work-order, and service line items.
          </p>
        </div>

        <div className="rounded-full bg-gray-950 px-5 py-2 text-sm font-black text-white">
          Draft Invoice
        </div>
      </div>

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

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Invoice Details
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="clientId"
                className="mb-2 block text-sm font-black"
              >
                Customer
              </label>

              <select
                id="clientId"
                value={form.clientId}
                onChange={(event) =>
                  handleClientChange(event.target.value)
                }
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="">
                  Select a customer
                </option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.client_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="propertyId"
                className="mb-2 block text-sm font-black"
              >
                Property
              </label>

              <select
                id="propertyId"
                value={form.propertyId}
                onChange={(event) =>
                  handlePropertyChange(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              >
                <option value="">
                  No property selected
                </option>

                {filteredProperties.map((property) => (
                  <option
                    key={property.id}
                    value={property.id}
                  >
                    {formatPropertyLabel(property)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="issueDate"
                className="mb-2 block text-sm font-black"
              >
                Issue Date
              </label>

              <input
                id="issueDate"
                type="date"
                value={form.issueDate}
                onChange={(event) =>
                  updateFormField(
                    "issueDate",
                    event.target.value,
                  )
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label
                htmlFor="dueDate"
                className="mb-2 block text-sm font-black"
              >
                Due Date
              </label>

              <input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  updateFormField(
                    "dueDate",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-black">
                Completed Work Ready to Invoice
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Add completed work orders that have not already been invoiced.
              </p>
            </div>

            <span className="rounded-full bg-gray-100 px-4 py-2 text-sm font-black text-gray-700">
              {filteredJobs.length} Available
            </span>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed bg-gray-50 p-6 text-center">
              <p className="font-black text-gray-800">
                No completed uninvoiced work orders match this customer or property.
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Custom invoice line items can still be entered below.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {filteredJobs.map((job) => {
                const alreadySelected = lineItems.some(
                  (lineItem) => lineItem.jobId === job.id,
                );

                return (
                  <article
                    key={job.id}
                    className="rounded-xl border bg-gray-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-gray-950">
                          {job.job_title}
                        </h3>

                        <p className="mt-1 text-sm font-bold text-gray-600">
                          {job.estimated_price === null ||
                          job.estimated_price === undefined
                            ? "Price not entered"
                            : formatCurrency(job.estimated_price)}
                        </p>
                      </div>

                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black uppercase text-green-700">
                        Completed
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => addCompletedJob(job)}
                      disabled={alreadySelected}
                      className="mt-4 w-full rounded-xl bg-bakerssPink px-4 py-2 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {alreadySelected
                        ? "Added to Invoice"
                        : "Add Work Order"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-black">
                Line Items
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Add completed work orders or enter custom
                charges.
              </p>
            </div>

            <button
              type="button"
              onClick={addLineItem}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-black transition hover:bg-gray-50"
            >
              Add Line Item
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {lineItems.map((lineItem, index) => {
              const lineTotal =
                (Number(lineItem.quantity) || 0) *
                (Number(lineItem.unitPrice) || 0);

              return (
                <article
                  key={lineItem.rowId}
                  className="rounded-2xl border bg-gray-50 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black">
                      Line Item {index + 1}
                    </h3>

                    <button
                      type="button"
                      onClick={() =>
                        removeLineItem(
                          lineItem.rowId,
                        )
                      }
                      className="text-sm font-black text-red-600"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Work Order
                      </label>

                      <select
                        value={lineItem.jobId}
                        onChange={(event) =>
                          handleJobSelection(
                            lineItem.rowId,
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                      >
                        <option value="">
                          Custom line item
                        </option>

                        {filteredJobs.map((job) => (
                          <option
                            key={job.id}
                            value={job.id}
                          >
                            {job.job_title} —{" "}
                            {job.estimated_price === null ||
                            job.estimated_price === undefined
                              ? "Price not entered"
                              : formatCurrency(job.estimated_price)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Service
                      </label>

                      <select
                        value={lineItem.serviceId}
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.rowId,
                            "serviceId",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                      >
                        <option value="">
                          No service selected
                        </option>

                        {services.map((service) => (
                          <option
                            key={service.id}
                            value={service.id}
                          >
                            {service.service_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-black">
                        Description
                      </label>

                      <input
                        type="text"
                        value={lineItem.description}
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.rowId,
                            "description",
                            event.target.value,
                          )
                        }
                        placeholder="Service or work performed"
                        required
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Quantity
                      </label>

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={lineItem.quantity}
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.rowId,
                            "quantity",
                            event.target.value,
                          )
                        }
                        required
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Unit Price
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lineItem.unitPrice}
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.rowId,
                            "unitPrice",
                            event.target.value,
                          )
                        }
                        required
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                      />
                    </div>
                  </div>

                  <div className="mt-4 text-right">
                    <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                      Line Total
                    </p>

                    <p className="mt-1 text-xl font-black">
                      {formatCurrency(lineTotal)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">
              Notes and Terms
            </h2>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-black">
                  Payment Terms
                </label>

                <input
                  type="text"
                  value={form.paymentTerms}
                  onChange={(event) =>
                    updateFormField(
                      "paymentTerms",
                      event.target.value,
                    )
                  }
                  placeholder="Due within 5 days"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Customer Notes
                </label>

                <textarea
                  rows={4}
                  value={form.customerNotes}
                  onChange={(event) =>
                    updateFormField(
                      "customerNotes",
                      event.target.value,
                    )
                  }
                  placeholder="Notes that may appear on the customer invoice"
                  className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Internal Notes
                </label>

                <textarea
                  rows={4}
                  value={form.internalNotes}
                  onChange={(event) =>
                    updateFormField(
                      "internalNotes",
                      event.target.value,
                    )
                  }
                  placeholder="Private billing or office notes"
                  className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            </div>
          </section>

          <section className="h-fit rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">
              Invoice Summary
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-black">
                  Discount Type
                </label>

                <select
                  value={form.discountType}
                  onChange={(event) =>
                    updateFormField(
                      "discountType",
                      event.target.value as
                        | "fixed"
                        | "percentage",
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                >
                  <option value="fixed">
                    Fixed Amount
                  </option>
                  <option value="percentage">
                    Percentage
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Discount Value
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountValue}
                  onChange={(event) =>
                    updateFormField(
                      "discountValue",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black">
                  Tax Rate (%)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.taxRate}
                  onChange={(event) =>
                    updateFormField(
                      "taxRate",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-bakerssPink focus:ring-2 focus:ring-pink-100"
                />
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t pt-5">
              <SummaryRow
                label="Subtotal"
                value={formatCurrency(
                  calculatedTotals.subtotal,
                )}
              />

              <SummaryRow
                label="Discount"
                value={`-${formatCurrency(
                  calculatedTotals.discountAmount,
                )}`}
              />

              <SummaryRow
                label="Tax"
                value={formatCurrency(
                  calculatedTotals.taxAmount,
                )}
              />

              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-lg font-black">
                  Total
                </span>

                <span className="text-3xl font-black">
                  {formatCurrency(
                    calculatedTotals.total,
                  )}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-6 w-full rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? "Creating Invoice..."
                : "Save Draft Invoice"}
            </button>

            <Link
              href="/invoices"
              className="mt-3 block w-full rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-black text-gray-800 transition hover:bg-gray-50"
            >
              Cancel
            </Link>
          </section>
        </div>
      </form>
    </div>
  );
}

function createEmptyLineItem(): LineItemForm {
  return {
    rowId: crypto.randomUUID(),
    jobId: "",
    serviceId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
  };
}

function getTodayInput() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDefaultDueDateInput() {
  const date = new Date();
  date.setDate(date.getDate() + 5);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatPropertyLabel(property: Property) {
  const primary =
    property.property_name ||
    property.street_address ||
    "Unnamed property";

  const location = [
    property.street_address,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(", ");

  return !location || location === primary
    ? primary
    : `${primary} — ${location}`;
}

function formatStatus(value: string | null) {
  if (!value) {
    return "New";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-bold text-gray-600">
        {label}
      </span>

      <span className="font-black text-gray-950">
        {value}
      </span>
    </div>
  );
}