export default function KpiCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-gray-500">{title}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
      <div className="mt-2 text-xs text-gray-500">{note}</div>
    </div>
  );
}
