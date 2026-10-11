import { CardSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from "@/components/WorkspaceSkeletons";

export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton count={3} />
      <CardSkeleton lines={8} />
    </div>
  );
}
