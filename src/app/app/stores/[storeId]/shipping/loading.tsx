import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function ShippingLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={6} />
    </div>
  );
}
