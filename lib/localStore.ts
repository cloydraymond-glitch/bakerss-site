import type { DataSet } from "@/lib/types";

const STORAGE_KEY = "bakersss-os-local-data";

const emptyData: DataSet = {
  clients: [],
  properties: [],
  services: [],
  employees: [],
  workOrders: [],
  estimates: [],
  invoices: [],
  photos: [],
  recurringSchedules: [],
  alerts: [],
  commercialAccounts: [],
} as unknown as DataSet;

export function loadData(): DataSet {
  if (typeof window === "undefined") {
    return emptyData;
  }

  try {
    const savedData = window.localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      return emptyData;
    }

    const parsedData = JSON.parse(savedData) as Partial<DataSet>;

    return {
      ...emptyData,
      ...parsedData,
    } as DataSet;
  } catch (error) {
    console.error("Unable to load local Bakersss OS data:", error);
    return emptyData;
  }
}

export function saveData(data: DataSet): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Unable to save local Bakersss OS data:", error);
  }
}

export function uid(prefix = "item"): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}