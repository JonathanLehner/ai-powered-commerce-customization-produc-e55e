import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function ProductEditorLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={8} />
      <CardSkeleton lines={4} />
    </div>
  );
}
