import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function CollectionLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={5} />
      </div>
    </div>
  );
}
