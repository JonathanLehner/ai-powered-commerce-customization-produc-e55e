import { CardSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from "@/components/WorkspaceSkeletons";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={5} />
      <CardSkeleton lines={8} />
    </div>
  );
}
