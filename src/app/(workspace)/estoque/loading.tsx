import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
  return <div className="space-y-5"><div><Skeleton className="h-7 w-32" /><Skeleton className="mt-2 h-4 w-72" /></div><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[400px] rounded-[10px]" /></div>;
}
