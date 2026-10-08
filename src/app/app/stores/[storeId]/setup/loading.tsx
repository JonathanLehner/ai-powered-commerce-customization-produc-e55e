import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function SetupLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <CardSkeleton lines={4} />
      <CardSkeleton lines={1} />
      <CardSkeleton lines={5} />
      <CardSkeleton lines={5} />
    </div>
  );
}
