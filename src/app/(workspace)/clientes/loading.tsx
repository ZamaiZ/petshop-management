import { Skeleton } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return <div className="space-y-5"><div><Skeleton className="h-7 w-36" /><Skeleton className="mt-2 h-4 w-64" /></div><Skeleton className="h-[420px] rounded-[10px]" /></div>;
}
