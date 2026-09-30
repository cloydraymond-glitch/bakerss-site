import EmptyState from '@/components/EmptyState';

export default function Page() {
  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black">Work Orders</h1>
          <p className="mt-1 text-gray-600">Track requests from intake to scheduled, completed, invoiced, and closed.</p>
        </div>
        <button className="rounded-xl bg-bakerssPink px-5 py-3 text-sm font-black text-white shadow-sm">New Work Order</button>
      </div>
      <div className="mt-6">
        <EmptyState title="No work orders yet" message="Once Supabase is connected, this screen will list open jobs, assignments, service type, priority, status, and completion photos." />
      </div>
    </div>
  );
}
