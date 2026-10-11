import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function CustomerLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={6} />
    </div>
  );
}
