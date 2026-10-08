import { CardSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/WorkspaceSkeletons";

export default function TeamLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <CardSkeleton lines={3} />
      <TableSkeleton rows={4} />
      <CardSkeleton lines={5} />
    </div>
  );
}
