import { Skeleton } from "@/components/ui/skeleton";

export default function DeliveriesLoading() {
  return <div className="space-y-5"><Skeleton className="h-9 w-48" /><div className="flex gap-4 overflow-hidden">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[500px] min-w-[280px] rounded-[10px]" />)}</div></div>;
}
