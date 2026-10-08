import { CardSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from "@/components/WorkspaceSkeletons";

export default function DiscountsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton count={3} />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={6} />
    </div>
  );
}
