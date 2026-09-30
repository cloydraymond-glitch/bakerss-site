create extension if not exists "uuid-ossp";

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  customer_type text default 'Residential',
  notes text,
  created_at timestamptz default now()
);

create table if not exists properties (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete set null,
  address_line1 text not null,
  city text,
  state text default 'SC',
  zip text,
  property_type text default 'Residential',
  gate_code text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  role text default 'Technician',
  status text default 'Active',
  created_at timestamptz default now()
);

create table if not exists services (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text,
  default_price numeric,
  active boolean default true
);

create table if not exists work_orders (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  assigned_employee_id uuid references employees(id) on delete set null,
  title text not null,
  description text,
  priority text default 'Normal',
  status text default 'New',
  scheduled_date date,
  scheduled_start time,
  scheduled_end time,
  quoted_amount numeric,
  invoice_status text default 'Not Invoiced',
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists work_order_photos (
  id uuid primary key default uuid_generate_v4(),
  work_order_id uuid references work_orders(id) on delete cascade,
  photo_url text not null,
  photo_type text default 'After',
  uploaded_at timestamptz default now()
);

insert into services (name, category, default_price) values
('Lawn Care', 'Exterior Maintenance', 50),
('Pressure Washing', 'Exterior Maintenance', 125),
('Interior Cleaning', 'Cleaning', 150),
('Deep Cleaning', 'Cleaning', 300),
('Handyman Service', 'Property Maintenance', 90),
('Pool Maintenance', 'Pool', null),
('Gutter Cleaning', 'Exterior Maintenance', null),
('Dryer Vent Cleaning', 'Property Maintenance', null),
('Irrigation Repair', 'Landscaping', null),
('Sod Installation', 'Landscaping', null)
on conflict do nothing;

insert into employees (full_name, role, status) values
('Caiden', 'Service Technician', 'Active'),
('Preston', 'Crew Member', 'Active'),
('David', 'Crew Member', 'Active'),
('Trey', 'Crew Member', 'Active')
on conflict do nothing;
