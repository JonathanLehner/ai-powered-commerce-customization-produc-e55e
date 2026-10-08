import { CardSkeleton, StatCardsSkeleton } from "@/components/WorkspaceSkeletons";

export default function StoreOverviewLoading() {
  return (
    <div className="space-y-7">
      <StatCardsSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <CardSkeleton className="lg:col-span-2" lines={6} />
        <CardSkeleton lines={5} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
