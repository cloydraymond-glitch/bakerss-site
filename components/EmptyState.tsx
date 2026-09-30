export default function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-10 text-center shadow-sm">
      <div className="text-xl font-bold">{title}</div>
      <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">{message}</p>
    </div>
  );
}
