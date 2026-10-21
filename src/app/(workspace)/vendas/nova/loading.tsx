import { Skeleton } from "@/components/ui/skeleton";

export default function NewSaleLoading() {
  return <div className="space-y-5"><Skeleton className="h-9 w-52" /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><Skeleton className="h-[680px] rounded-[10px]" /><Skeleton className="h-[520px] rounded-[10px]" /></div></div>;
}
