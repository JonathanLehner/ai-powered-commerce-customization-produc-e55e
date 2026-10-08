import {
  CardSkeleton,
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/WorkspaceSkeletons";

export default function GiftingLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
      <TableSkeleton />
    </div>
  );
}
