import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function GiftCatalogueLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={3} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={6} />
      </div>
    </div>
  );
}
