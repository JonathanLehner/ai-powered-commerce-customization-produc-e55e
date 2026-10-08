import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  StatCardsSkeleton,
  ToolbarSkeleton,
} from "@/components/WorkspaceSkeletons";

export default function CatalogLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <ToolbarSkeleton />
      <CardGridSkeleton />
    </div>
  );
}
