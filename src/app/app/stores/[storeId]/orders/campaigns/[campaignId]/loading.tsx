import { CardSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from "@/components/WorkspaceSkeletons";

export default function CampaignLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CardSkeleton lines={8} />
        <CardSkeleton lines={6} />
      </div>
    </div>
  );
}
