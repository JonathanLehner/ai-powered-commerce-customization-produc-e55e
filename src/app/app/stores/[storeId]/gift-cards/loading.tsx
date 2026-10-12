import { CardSkeleton, PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/WorkspaceSkeletons";

export default function GiftCardsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton count={3} />
      <CardSkeleton lines={4} />
      <TableSkeleton rows={5} />
    </div>
  );
}
