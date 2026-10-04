export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 rounded-lg bg-muted/70" />
        <div className="h-4 w-72 rounded-md bg-muted/40" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm"
          >
            <div className="h-11 w-11 rounded-xl bg-muted/60" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted/40" />
              <div className="h-6 w-16 rounded bg-muted/70" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-5 w-36 rounded bg-muted/60" />
          <div className="h-6 w-20 rounded-full bg-muted/40" />
        </div>
        <div className="h-64 w-full rounded-xl bg-muted/30" />
      </div>
    </div>
  );
}
