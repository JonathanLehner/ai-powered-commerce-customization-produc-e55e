import { CardSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/WorkspaceSkeletons";

export default function MenusLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <CardSkeleton lines={2} />
      <TableSkeleton rows={4} />
    </div>
  );
}
