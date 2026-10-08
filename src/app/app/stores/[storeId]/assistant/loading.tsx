import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function AssistantLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <div className="grid gap-5 lg:grid-cols-2">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>
    </div>
  );
}
