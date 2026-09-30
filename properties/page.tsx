import EmptyState from '@/components/EmptyState';

export default function Page() {
  return (
    <div>
      <h1 className="text-3xl font-black">Properties</h1>
      <p className="mt-1 text-gray-600">Bakersss cloud record management.</p>
      <div className="mt-6">
        <EmptyState title="No records loaded yet" message="Connect Supabase, run the schema, then add records through forms or direct imports." />
      </div>
    </div>
  );
}
