import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function ReviewsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={3} />
    </div>
  );
}
