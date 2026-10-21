import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return <div className="space-y-5"><div><Skeleton className="h-7 w-36" /><Skeleton className="mt-2 h-4 w-72" /></div><div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[430px] rounded-[10px]" /></div>;
}
