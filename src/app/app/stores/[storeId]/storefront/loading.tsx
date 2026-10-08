import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function StorefrontEditorLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={12} />
        <CardSkeleton lines={6} />
      </div>
    </div>
  );
}
