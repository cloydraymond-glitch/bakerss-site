export type GenericRecord = {
  id: string;
  [key: string]: any;
};

export type WorkOrderRecord = GenericRecord & {
  service_id?: string;
  employee_id?: string;
  property_id?: string;
  status?: string;
  date?: string;
};

export type PhotoRecord = GenericRecord & {
  work_order_id?: string;
  type?: "before" | "progress" | "completion";
  label?: string;
  url?: string;
  created_at?: string;
};

export type RecurringScheduleRecord = GenericRecord & {
  property_id?: string;
  service_id?: string;
  employee_id?: string;
  frequency?: string;
  preferred_day?: string;
  start_date?: string;
  active?: boolean;
  notes?: string;
};

export type DataSet = {
  clients: GenericRecord[];
  customers: GenericRecord[];
  properties: GenericRecord[];
  services: GenericRecord[];
  employees: GenericRecord[];
  workOrders: WorkOrderRecord[];
  estimates: GenericRecord[];
  invoices: GenericRecord[];
  photos: PhotoRecord[];
  recurringSchedules: RecurringScheduleRecord[];
  alerts: GenericRecord[];
  commercialAccounts: GenericRecord[];
  portalRequests: GenericRecord[];
  equipment: GenericRecord[];
  [key: string]: GenericRecord[];
};