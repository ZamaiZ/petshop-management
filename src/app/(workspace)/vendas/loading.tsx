import { Skeleton } from "@/components/ui/skeleton";

export default function SalesLoading() {
  return <div className="space-y-5"><Skeleton className="h-9 w-48" /><div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-[10px]" />)}</div><Skeleton className="h-[420px] rounded-[10px]" /></div>;
}
