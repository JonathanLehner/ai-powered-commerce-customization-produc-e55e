import { CardSkeleton, PageHeaderSkeleton } from "@/components/WorkspaceSkeletons";

export default function NewStoreLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6">
      <PageHeaderSkeleton />
      <div className="mt-6">
        <CardSkeleton lines={8} />
      </div>
    </div>
  );
}
