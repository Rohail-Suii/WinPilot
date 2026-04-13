export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#00E5FF] border-t-transparent" />
        <p className="text-[#444444] text-sm">Loading dashboard...</p>
      </div>
    </div>
  );
}
