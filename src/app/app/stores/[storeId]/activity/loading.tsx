import { PageHeaderSkeleton, TableSkeleton, ToolbarSkeleton } from "@/components/WorkspaceSkeletons";

export default function ActivityLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <ToolbarSkeleton />
      <TableSkeleton rows={10} />
    </div>
  );
}
