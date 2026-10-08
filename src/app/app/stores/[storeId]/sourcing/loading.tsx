import { CardGridSkeleton, PageHeaderSkeleton, ToolbarSkeleton } from "@/components/WorkspaceSkeletons";

export default function SourcingLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <ToolbarSkeleton />
      <CardGridSkeleton />
    </div>
  );
}
